// Wait for all libraries to load
(function initTerminal() {
  // Check if libraries are loaded
  if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined' || typeof io === 'undefined') {
    setTimeout(initTerminal, 50);
    return;
  }

  const socket = io();
  const term = new Terminal({
    scrollback: 10000,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    cursorBlink: true
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));

  // Fit terminal and send dimensions to server
  fitAddon.fit();
  socket.emit('resize', { cols: term.cols, rows: term.rows });

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
    socket.emit('data', '\x1b[A'); // Up arrow
  });

  document.getElementById('arrow-down-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[B'); // Down arrow
  });

  document.getElementById('arrow-right-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[C'); // Right arrow
  });

  document.getElementById('arrow-left-btn').addEventListener('click', () => {
    socket.emit('data', '\x1b[D'); // Left arrow
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

  // Relay terminal input to server with Ctrl modifier if active
  term.onData((data) => {
    if (ctrlActive && data.length === 1) {
      const char = data.toLowerCase();
      const code = char.charCodeAt(0);

      // Handle Ctrl+letter (a-z)
      if (code >= 97 && code <= 122) {
        // Convert to Ctrl code (Ctrl+A = 1, Ctrl+B = 2, etc.)
        const ctrlCode = String.fromCharCode(code - 96);
        socket.emit('data', ctrlCode);
        // Auto-release Ctrl after use
        ctrlActive = false;
        ctrlBtn.classList.remove('active');
        return;
      }
    }
    socket.emit('data', data);
  });

  // Receive output from server
  socket.on('data', (data) => {
    term.write(data);
  });

  // Handle errors from server
  socket.on('error', (message) => {
    term.write('\r\n\x1b[1;31mError: ' + message + '\x1b[0m\r\n');
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
      const command = event.results[0][0].transcript + '\r\n'; // Add enter
      term.write(command); // Echo to terminal
      socket.emit('data', command); // Send to server
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
