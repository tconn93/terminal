// Wait for all libraries to load
(function initTerminal() {
  // Check if libraries are loaded
  if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined' || typeof io === 'undefined') {
    setTimeout(initTerminal, 50);
    return;
  }

  // --- Session persistence via localStorage ---
  // The sessionId maps to a named tmux session on the VM.
  // The tmux session keeps running even when this page is closed or the browser
  // goes to background, so apps inside it are never interrupted.
  const storedSessionId = localStorage.getItem('terminalSessionId');

  const socket = io({
    auth: { sessionId: storedSessionId },
    // Socket.IO will automatically attempt to reconnect on disconnect
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  const term = new Terminal({
    scrollback: 10000,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    cursorBlink: true
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));

  fitAddon.fit();

  // --- Banner helpers ---
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

  // --- Socket connection state ---
  socket.on('connect', () => {
    // Send current terminal size once connected
    socket.emit('resize', { cols: term.cols, rows: term.rows });
  });

  socket.on('disconnect', (reason) => {
    const msg = reason === 'io server disconnect'
      ? 'Disconnected by server. Click "New Session" to reconnect.'
      : 'Connection lost — reconnecting...';
    showBanner(msg, 'warning');
  });

  socket.on('connect_error', () => {
    showBanner('Cannot reach server — retrying...', 'warning');
  });

  // --- Session lifecycle events ---
  socket.on('session-created', (id) => {
    localStorage.setItem('terminalSessionId', id);
    hideBanner();
    // Clear terminal for a clean start
    term.reset();
    fitAddon.fit();
    socket.emit('resize', { cols: term.cols, rows: term.rows });
  });

  socket.on('session-resumed', (id) => {
    localStorage.setItem('terminalSessionId', id);
    // Clear stale client-side content; tmux will redraw the current screen
    term.reset();
    fitAddon.fit();
    socket.emit('resize', { cols: term.cols, rows: term.rows });
    showBanner('Reconnected to existing session', 'success', 3000);
  });

  socket.on('ssh-error', (message) => {
    showBanner('SSH error: ' + message, 'error');
  });

  // --- Terminal I/O ---
  socket.on('data', (data) => {
    term.write(data);
  });

  // Ctrl key toggle state
  let ctrlActive = false;
  const ctrlBtn = document.getElementById('ctrl-btn');

  ctrlBtn.addEventListener('click', () => {
    ctrlActive = !ctrlActive;
    if (ctrlActive) {
      ctrlBtn.classList.add('active');
    } else {
      ctrlBtn.classList.remove('active');
    }
  });

  // Arrow key buttons
  document.getElementById('arrow-up-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[A');
  });

  document.getElementById('arrow-down-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[B');
  });

  document.getElementById('arrow-right-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[C');
  });

  document.getElementById('arrow-left-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[D');
  });

  // Character buttons
  document.getElementById('dot-btn').addEventListener('click', () => {
    socket.emit('data', '.');
  });

  document.getElementById('slash-btn').addEventListener('click', () => {
    socket.emit('data', '/');
  });

  document.getElementById('tilde-btn').addEventListener('click', () => {
    socket.emit('data', '~');
  });

  // New Session button — kills the current tmux session on the VM and starts fresh
  document.getElementById('new-session-btn').addEventListener('click', () => {
    if (!confirm('Start a new session? The current session and all running processes will be terminated.')) return;
    localStorage.removeItem('terminalSessionId');
    socket.emit('new-session');
  });

  // Relay terminal input to server with Ctrl modifier if active
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

  // Microphone integration
  const micBtn = document.getElementById('mic-btn');
  let recognition;

  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const command = event.results[0][0].transcript + '\r\n';
      term.write(command);
      socket.emit('data', command);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      alert('Speech recognition failed: ' + event.error);
    };

    micBtn.addEventListener('click', () => {
      recognition.start();
      micBtn.textContent = '🔴 Listening...';
      recognition.onend = () => {
        micBtn.textContent = '🎤 Speak';
      };
    });
  } else {
    micBtn.disabled = true;
    micBtn.textContent = '🎤 Not Supported';
  }

  // Handle window resize for mobile
  window.addEventListener('resize', () => {
    fitAddon.fit();
    socket.emit('resize', { cols: term.cols, rows: term.rows });
  });
})();
