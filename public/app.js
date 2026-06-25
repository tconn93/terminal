// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Wait for all libraries to load
(function initTerminal() {
  if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined' || typeof io === 'undefined') {
    setTimeout(initTerminal, 50);
    return;
  }

  // ============================================================
  // State
  // ============================================================
  let micActive = false;
  let mode = 'cli';                // 'cli' | 'verbatim'
  let approveMode = 'approve';     // 'approve' | 'auto'  (only used in CLI mode)
  let ctrlActive = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let pendingCommands = [];        // commands awaiting approval
  let pendingAgentText = null;     // transcript waiting for agent confirmation

  // ============================================================
  // DOM Elements
  // ============================================================
  const micBtn = document.getElementById('mic-btn');
  const micIcon = micBtn.querySelector('.mic-icon');
  const modeBtn = document.getElementById('mode-btn');
  const modeLabel = document.getElementById('mode-label');
  const approveBtn = document.getElementById('approve-btn');
  const approveLabel = document.getElementById('approve-label');
  const ctrlBtn = document.getElementById('ctrl-btn');
  const tmuxBtn = document.getElementById('tmux-btn');
  const tmuxModal = document.getElementById('tmux-modal');
  const tmuxModalClose = document.getElementById('tmux-modal-close');
  const approveModal = document.getElementById('approve-modal');
  const approveModalTitle = approveModal.querySelector('.modal-header h2');
  const approveModalClose = document.getElementById('approve-modal-close');
  const approveCancelBtn = document.getElementById('approve-cancel-btn');
  const approveRunBtn = document.getElementById('approve-run-btn');
  const approveCommandsList = document.getElementById('approve-commands-list');
  const processingOverlay = document.getElementById('processing-overlay');
  const processingText = document.getElementById('processing-text');

  // ============================================================
  // Banner helpers
  // ============================================================
  const banner = document.getElementById('status-banner');
  const bannerMsg = document.getElementById('banner-message');
  let bannerTimer = null;

  function showBanner(message, type, autoDismissMs) {
    clearTimeout(bannerTimer);
    bannerMsg.textContent = message;
    banner.className = 'banner ' + type;
    if (autoDismissMs) {
      bannerTimer = setTimeout(hideBanner, autoDismissMs);
    }
  }

  function hideBanner() {
    clearTimeout(bannerTimer);
    banner.className = 'banner hidden';
  }

  // ============================================================
  // Processing overlay
  // ============================================================
  function showProcessing(text) {
    processingText.textContent = text || 'Processing...';
    processingOverlay.classList.remove('hidden');
  }

  function hideProcessing() {
    processingOverlay.classList.add('hidden');
  }

  // ============================================================
  // Socket.IO setup with session persistence
  // ============================================================
  const storedSessionId = localStorage.getItem('terminalSessionId');

  const socket = io({
    auth: { sessionId: storedSessionId },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // ============================================================
  // xterm.js setup
  // ============================================================
  const term = new Terminal({
    scrollback: 50000,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: '#1f6feb55',
      black: '#484f58',
      red: '#f85149',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ff7b72',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    }
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));

  fitAddon.fit();

  // ============================================================
  // Mobile touch scroll — map finger drag to terminal scrollLines
  // ============================================================
  let touchScrollY = 0;
  const termContainer = document.getElementById('terminal-container');

  termContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) touchScrollY = e.touches[0].clientY;
  }, { passive: true });

  termContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const delta = touchScrollY - e.touches[0].clientY;
      touchScrollY = e.touches[0].clientY;
      const lines = Math.round(delta / 20);
      if (lines !== 0) term.scrollLines(lines);
    }
  }, { passive: true });

  termContainer.addEventListener('touchend', () => { touchScrollY = 0; }, { passive: true });
  termContainer.addEventListener('touchcancel', () => { touchScrollY = 0; }, { passive: true });

  // ============================================================
  // Socket event handlers
  // ============================================================
  socket.on('connect', () => {
    socket.emit('resize', { cols: term.cols, rows: term.rows });
  });

  socket.on('disconnect', (reason) => {
    const msg = reason === 'io server disconnect'
      ? 'Disconnected by server. Click "+ New" to reconnect.'
      : 'Connection lost — reconnecting...';
    showBanner(msg, 'warning');
  });

  socket.on('connect_error', (err) => {
    const reason = err && err.message === 'unauthorized'
      ? 'Not authorized — check login'
      : 'Cannot reach server — retrying...';
    showBanner(reason, 'warning');
  });

  socket.on('session-created', (id) => {
    localStorage.setItem('terminalSessionId', id);
    hideBanner();
    term.reset();
    fitAddon.fit();
    socket.emit('resize', { cols: term.cols, rows: term.rows });
  });

  socket.on('session-resumed', (id) => {
    localStorage.setItem('terminalSessionId', id);
    term.reset();
    fitAddon.fit();
    socket.emit('resize', { cols: term.cols, rows: term.rows });
    showBanner('Reconnected to existing session', 'success', 3000);
  });

  socket.on('ssh-error', (message) => {
    showBanner('SSH error: ' + message, 'error');
  });

  // ============================================================
  // Terminal I/O
  // ============================================================
  socket.on('data', (data) => {
    term.write(data);
  });

  term.onData((data) => {
    if (ctrlActive && data.length === 1) {
      const char = data.toLowerCase();
      const code = char.charCodeAt(0);
      // Handle Ctrl+letter (a-z)
      if (code >= 97 && code <= 122) {
        const ctrlCode = String.fromCharCode(code - 96);
        socket.emit('data', ctrlCode);
        ctrlActive = false;
        ctrlBtn.classList.remove('active');
        return;
      }
    }
    socket.emit('data', data);
  });

  // ============================================================
  // Keep keyboard visible when tapping toolbar buttons.
  // Toolbar button taps blur xterm.js's hidden textarea, which causes
  // iOS to dismiss the on-screen keyboard. Refocus the terminal after
  // any toolbar click to bring the keyboard back immediately.
  // ============================================================
  document.getElementById('toolbar').addEventListener('click', () => {
    term.focus();
  });

  // ============================================================
  // Ctrl modifier button
  // ============================================================
  ctrlBtn.addEventListener('click', () => {
    ctrlActive = !ctrlActive;
    if (ctrlActive) {
      ctrlBtn.classList.add('active');
    } else {
      ctrlBtn.classList.remove('active');
    }
  });

  // Esc button
  document.getElementById('esc-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b');
  });

  // ============================================================
  // Arrow key buttons — hold to repeat
  // ============================================================
  const ARROW_REPEAT_DELAY = 400;  // ms before repeat starts
  const ARROW_REPEAT_RATE  = 50;   // ms between repeats (~20/s)

  function addArrowRepeat(btnId, seq) {
    const btn = document.getElementById(btnId);
    let repeatTimer = null;
    let repeatInterval = null;

    const stopRepeat = () => {
      clearTimeout(repeatTimer);
      clearInterval(repeatInterval);
      repeatTimer = null;
      repeatInterval = null;
    };

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // don't let the button steal focus from xterm
      socket.emit('data', seq);          // fire immediately
      stopRepeat();                       // safety: clear any stale timers
      repeatTimer = setTimeout(() => {
        repeatInterval = setInterval(() => {
          socket.emit('data', seq);
        }, ARROW_REPEAT_RATE);
      }, ARROW_REPEAT_DELAY);
    });

    btn.addEventListener('pointerup', stopRepeat);
    btn.addEventListener('pointerleave', stopRepeat);
    btn.addEventListener('pointercancel', stopRepeat);
  }

  addArrowRepeat('arrow-up-btn',    '\x1b[A');
  addArrowRepeat('arrow-down-btn',  '\x1b[B');
  addArrowRepeat('arrow-left-btn',  '\x1b[D');
  addArrowRepeat('arrow-right-btn', '\x1b[C');

  // ============================================================
  // Character buttons
  // ============================================================
  document.getElementById('dot-btn').addEventListener('click', () => {
    socket.emit('data', '.');
  });
  document.getElementById('slash-btn').addEventListener('click', () => {
    socket.emit('data', '/');
  });
  document.getElementById('tilde-btn').addEventListener('click', () => {
    socket.emit('data', '~');
  });

  // ============================================================
  // New Session button
  // ============================================================
  document.getElementById('new-session-btn').addEventListener('click', () => {
    if (!confirm('Start a new session? The current session and all running processes will be terminated.')) return;
    localStorage.removeItem('terminalSessionId');
    socket.emit('new-session');
  });

  // ============================================================
  // Tmux modal
  // ============================================================
  tmuxBtn.addEventListener('click', () => {
    tmuxModal.classList.remove('hidden');
  });

  tmuxModalClose.addEventListener('click', () => {
    tmuxModal.classList.add('hidden');
  });

  tmuxModal.addEventListener('click', (e) => {
    if (e.target === tmuxModal) {
      tmuxModal.classList.add('hidden');
    }
  });

  // Tmux shortcut buttons — send Ctrl+B prefix then the key
  document.querySelectorAll('.shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const seq = btn.dataset.seq;
      if (seq) {
        // Send tmux prefix (Ctrl+B = \x02) then the command key
        socket.emit('data', '\x02' + seq);
      }
      tmuxModal.classList.add('hidden');
    });
  });

  // ============================================================
  // Mode toggle (CLI <-> Verbatim)
  // ============================================================
  function updateModeUI() {
    if (mode === 'cli') {
      modeLabel.textContent = 'CLI';
      modeBtn.className = 'tb-btn mode-btn mode-cli';
      // Show approve toggle (only relevant in CLI mode)
      approveBtn.style.display = '';
      updateApproveUI();
    } else {
      modeLabel.textContent = 'VERB';
      modeBtn.className = 'tb-btn mode-btn mode-verbatim';
      // Hide approve toggle in verbatim mode
      approveBtn.style.display = 'none';
    }
  }

  modeBtn.addEventListener('click', () => {
    mode = mode === 'cli' ? 'verbatim' : 'cli';
    updateModeUI();
  });

  // ============================================================
  // Approve/Auto toggle (only for CLI mode)
  // ============================================================
  function updateApproveUI() {
    if (approveMode === 'approve') {
      approveLabel.textContent = '✓ Approve';
      approveBtn.className = 'tb-btn approve-btn approve-on';
    } else {
      approveLabel.textContent = '⚡ Auto';
      approveBtn.className = 'tb-btn approve-btn approve-auto';
    }
  }

  approveBtn.addEventListener('click', () => {
    approveMode = approveMode === 'approve' ? 'auto' : 'approve';
    updateApproveUI();
  });

  // ============================================================
  // Command approval modal
  // ============================================================
  const approveModalHint = approveModal.querySelector('.modal-hint');
  const APPROVE_TITLE_DEFAULT = '🤖 Commands to Run';
  const APPROVE_HINT_DEFAULT = 'Grok generated these commands. Review before executing.';

  function showApproveModal(commands) {
    pendingCommands = commands;
    pendingAgentText = null;
    if (approveModalTitle) approveModalTitle.textContent = APPROVE_TITLE_DEFAULT;
    if (approveModalHint) approveModalHint.textContent = APPROVE_HINT_DEFAULT;
    approveRunBtn.textContent = '▶ Run All';
    approveCommandsList.innerHTML = commands.map((cmd, i) =>
      `<div class="approve-command-item"><span class="cmd-number">#${i + 1}</span>${escapeHtml(cmd)}</div>`
    ).join('');
    approveModal.classList.remove('hidden');
  }

  function showAgentConfirmModal(transcript) {
    pendingCommands = [];
    pendingAgentText = transcript;
    if (approveModalTitle) approveModalTitle.textContent = '🤖 Send to Agent?';
    if (approveModalHint) approveModalHint.textContent = 'Your voice command will be sent to the Grok agent, which will run commands on your VM.';
    approveRunBtn.textContent = '▶ Run Agent';
    approveCommandsList.innerHTML = `<div class="approve-command-item">${escapeHtml(transcript)}</div>`;
    approveModal.classList.remove('hidden');
  }

  function hideApproveModal() {
    approveModal.classList.add('hidden');
    pendingCommands = [];
    pendingAgentText = null;
    if (approveModalTitle) approveModalTitle.textContent = APPROVE_TITLE_DEFAULT;
    if (approveModalHint) approveModalHint.textContent = APPROVE_HINT_DEFAULT;
    approveRunBtn.textContent = '▶ Run All';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  approveModalClose.addEventListener('click', hideApproveModal);
  approveCancelBtn.addEventListener('click', hideApproveModal);

  approveModal.addEventListener('click', (e) => {
    if (e.target === approveModal) hideApproveModal();
  });

  approveRunBtn.addEventListener('click', () => {
    if (pendingAgentText) {
      const agentText = pendingAgentText;
      hideApproveModal();
      showProcessing('Agent running...');
      const sessionId = localStorage.getItem('terminalSessionId');
      fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: agentText, sessionId })
      }).catch(err => {
        showBanner('Agent error: ' + err.message, 'error', 5000);
      }).finally(() => {
        hideProcessing();
      });
    } else {
      executeCommands(pendingCommands);
      hideApproveModal();
    }
  });

  // ============================================================
  // Execute commands in sequence
  // ============================================================
  function executeCommands(commands) {
    if (!commands || commands.length === 0) return;
    for (const cmd of commands) {
      // Echo the command so the user sees what's being run
      term.write('\r\n\x1b[36m$\x1b[0m ' + cmd + '\r\n');
      socket.emit('data', cmd + '\r');
    }
  }

  // ============================================================
  // Microphone — Grok STT integration via MediaRecorder
  // ============================================================
  let microphoneStream = null;

  async function startMicrophone() {
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      mediaRecorder = new MediaRecorder(microphoneStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      });

      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Release the microphone
        if (microphoneStream) {
          microphoneStream.getTracks().forEach(t => t.stop());
          microphoneStream = null;
        }

        if (audioChunks.length === 0) {
          updateMicUI(false);
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        // If the recording is too short (< 0.5s), skip
        if (audioBlob.size < 1000) {
          updateMicUI(false);
          return;
        }

        updateMicUI('processing');
        showProcessing('Transcribing with Grok...');

        try {
          // Step 1: Transcribe audio via Grok STT
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const transcribeResp = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
          });

          if (!transcribeResp.ok) {
            const err = await transcribeResp.json();
            throw new Error(err.error || 'Transcription failed');
          }

          const transcribeData = await transcribeResp.json();
          const transcript = transcribeData.text || '';

          if (!transcript.trim()) {
            hideProcessing();
            updateMicUI(false);
            showBanner('No speech detected — try again', 'warning', 3000);
            return;
          }

          // Show what was transcribed
          term.write('\r\n\x1b[33m🎤\x1b[0m ' + transcript + '\r\n');

          if (mode === 'verbatim') {
            // Verbatim mode: send transcript directly to terminal
            hideProcessing();
            updateMicUI(false);
            socket.emit('data', transcript + '\r');
          } else {
            // CLI mode: Grok agent with bash_command + write_file tools
            if (approveMode === 'approve') {
              // Show transcript for confirmation before running agent
              hideProcessing();
              updateMicUI(false);
              showAgentConfirmModal(transcript);
            } else {
              // Auto mode: run agent immediately
              processingText.textContent = 'Agent running...';
              try {
                const sessionId = localStorage.getItem('terminalSessionId');
                const agentResp = await fetch('/api/agent', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: transcript, sessionId })
                });
                if (!agentResp.ok) {
                  const errData = await agentResp.json().catch(() => ({ error: 'Unknown error' }));
                  showBanner('Agent error: ' + (errData.error || 'Unknown'), 'error', 5000);
                }
              } finally {
                hideProcessing();
                updateMicUI(false);
              }
            }
          }
        } catch (err) {
          hideProcessing();
          updateMicUI(false);
          console.error('Mic pipeline error:', err);
          showBanner('Error: ' + err.message, 'error', 5000);
        }
      };

      // Start recording
      mediaRecorder.start();
      updateMicUI(true);

    } catch (err) {
      console.error('Microphone access error:', err);

      // Fallback: try browser SpeechRecognition API
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showBanner('Mic access denied. Check browser permissions.', 'error', 5000);
      } else if (err.name === 'NotFoundError') {
        showBanner('No microphone found on this device.', 'error', 5000);
      } else {
        showBanner('Mic error: ' + err.message, 'error', 5000);
      }
      updateMicUI(false);
    }
  }

  function stopMicrophone() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    } else if (microphoneStream) {
      // If recorder hasn't started yet but we have a stream
      microphoneStream.getTracks().forEach(t => t.stop());
      microphoneStream = null;
      updateMicUI(false);
    }
  }

  function updateMicUI(state) {
    // state: true (recording), false (idle), 'processing'
    if (state === true) {
      micActive = true;
      micIcon.textContent = '🔴';
      micBtn.classList.add('active');
      micBtn.classList.remove('processing');
    } else if (state === 'processing') {
      micActive = false;
      micIcon.textContent = '⏳';
      micBtn.classList.remove('active');
      micBtn.classList.add('processing');
    } else {
      micActive = false;
      micIcon.textContent = '🎤';
      micBtn.classList.remove('active');
      micBtn.classList.remove('processing');
    }
  }

  micBtn.addEventListener('click', () => {
    if (!micActive) {
      startMicrophone();
    } else {
      stopMicrophone();
    }
  });

  // ============================================================
  // visualViewport — keep toolbar above mobile keyboard,
  // re-fit terminal when layout changes, and toggle tmux copy
  // mode when the keyboard is dismissed / brought back.
  // ============================================================
  if (window.visualViewport) {
    const toolbar = document.getElementById('toolbar');
    const KB_THRESHOLD = 100; // pixels — viewport must shrink by at least this much to count as "keyboard visible"
    let keyboardVisible = false;
    let keyboardStateInitialized = false;

    const viewportHandler = () => {
      const viewport = window.visualViewport;
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const nowVisible = offset > KB_THRESHOLD;

      // Detect transitions (skip on the very first call)
      if (keyboardStateInitialized && nowVisible !== keyboardVisible) {
        if (nowVisible) {
          // Keyboard came up → exit tmux copy mode
          socket.emit('data', '\x1b');
        } else {
          // Keyboard dismissed → enter tmux copy mode
          socket.emit('data', '\x02[');
        }
      }

      keyboardVisible = nowVisible;
      keyboardStateInitialized = true;

      // Push the toolbar up so it sits right above the on-screen keyboard
      toolbar.style.transform = `translateY(-${offset}px)`;
      // Re-fit terminal after keyboard show/hide so xterm recalculates its viewport
      fitAddon.fit();
      socket.emit('resize', { cols: term.cols, rows: term.rows });
    };

    window.visualViewport.addEventListener('resize', viewportHandler);
    window.visualViewport.addEventListener('scroll', viewportHandler);

    // Initial call
    viewportHandler();
  }

  // ============================================================
  // Resize handler
  // ============================================================
  window.addEventListener('resize', () => {
    fitAddon.fit();
    socket.emit('resize', { cols: term.cols, rows: term.rows });
  });

  // ============================================================
  // Keyboard shortcut: Escape closes modals
  // ============================================================
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!tmuxModal.classList.contains('hidden')) {
        tmuxModal.classList.add('hidden');
      }
      if (!approveModal.classList.contains('hidden')) {
        hideApproveModal();
      }
    }
  });

  // ============================================================
  // Initialize UI state
  // ============================================================
  updateModeUI();

})();
