### Project Overview
This guide will help you build a web-based terminal application that connects to a virtual machine (VM) on your local network. The app will feature:
- A responsive frontend for easy use on mobile devices.
- Real-time terminal interaction via WebSockets.
- Speech-to-text input using the device's microphone (via the Web Speech API).
- A backend server to handle secure connections to the VM (assuming SSH access).

We'll use:
- **Frontend**: HTML, CSS, JavaScript with xterm.js for terminal emulation and Socket.IO for WebSockets.
- **Backend**: Node.js with Express, Socket.IO, and ssh2 for SSH connections to the VM.
- **Speech Input**: Browser's Web Speech API (works on most modern browsers, including mobile Chrome/Safari).

**Environment details**:
- My Environment details will be in the .env file. Do not copy these details in the code or markdown files. Example below

```.env
VM_HOST=[host ip address for VM]
VM_PORT=[default port is 22]
VM_USER=[username to connect to VM with]
VM_PWORD=[password for username on VM]
```


### Step 1: Set Up the Project Structure
1. Create a new directory for your project: `mkdir web-terminal && cd web-terminal`.
2. Initialize a Node.js project: `npm init -y`.
3. Install dependencies:
   ```
   npm install express socket.io ssh2 xterm socket.io-client
   ```
   - `express`: For the web server.
   - `socket.io`: For real-time WebSocket communication.
   - `ssh2`: For SSH client to connect to VM.
   - `xterm` and `socket.io-client`: Frontend libraries (xterm for terminal UI).
4. Create subfolders: `mkdir public` (for frontend files).

Your structure:
```
web-terminal/
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js
├── server.js
├── package.json
```

### Step 2: Build the Backend (server.js)
The backend will:
- Serve the frontend.
- Handle WebSocket connections.
- Establish an SSH session to the VM and relay terminal I/O.

Create `server.js`:
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected');

  // SSH config - replace with your VM details
  const sshConfig = {
    host: '192.168.1.100', // VM IP
    port: 22,
    username: 'your-vm-username',
    password: 'your-vm-password' // Use privateKey for better security: { privateKey: require('fs').readFileSync('/path/to/key') }
  };

  const conn = new Client();
  conn.on('ready', () => {
    console.log('SSH connected');
    conn.shell((err, stream) => {
      if (err) throw err;

      // Relay data from client to SSH
      socket.on('data', (data) => {
        stream.write(data);
      });

      // Relay SSH output to client
      stream.on('data', (data) => {
        socket.emit('data', data.toString('utf-8'));
      });

      stream.on('close', () => {
        conn.end();
      });
    });
  }).connect(sshConfig);

  socket.on('disconnect', () => {
    console.log('User disconnected');
    conn.end();
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- **Security Note**: Hardcoding passwords is insecure. Use environment variables (e.g., `process.env.VM_PASSWORD`) or SSH keys. For production, add authentication (e.g., JWT) before connecting to SSH.
- Test: Run `node server.js` and visit `http://localhost:3000` (it'll serve the frontend we'll build next).

### Step 3: Build the Frontend (public/index.html, style.css, app.js)
The frontend will:
- Display a terminal UI.
- Connect via WebSocket.
- Use microphone for speech-to-text input.
- Be responsive for mobile (use flexbox and media queries).

#### index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Web Terminal</title>
  <link rel="stylesheet" href="https://unpkg.com/xterm/css/xterm.css">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="container">
    <div id="terminal"></div>
    <button id="mic-btn">🎤 Speak Command</button>
  </div>
  <script src="https://unpkg.com/xterm/lib/xterm.js"></script>
  <script src="https://unpkg.com/socket.io-client@4"></script>
  <script src="app.js"></script>
</body>
</html>
```

#### style.css (for mobile-friendliness)
```css
body, html {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: monospace;
}

#container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #000;
}

#terminal {
  flex: 1;
  width: 100%;
}

#mic-btn {
  padding: 10px;
  font-size: 18px;
  background: #333;
  color: #fff;
  border: none;
  cursor: pointer;
  width: 100%;
}

@media (max-width: 768px) {
  #mic-btn {
    font-size: 24px; /* Larger for touch */
  }
}
```

#### app.js (Frontend Logic)
```javascript
const socket = io();
const term = new Terminal();
term.open(document.getElementById('terminal'));
term.fit(); // Auto-resize for mobile

// Relay terminal input to server
term.onData((data) => {
  socket.emit('data', data);
});

// Receive output from server
socket.on('data', (data) => {
  term.write(data);
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
      micBtn.textContent = '🎤 Speak Command';
    };
  });
} else {
  micBtn.disabled = true;
  micBtn.textContent = 'Microphone Not Supported';
}

// Handle window resize for mobile
window.addEventListener('resize', () => term.fit());
```

- **Microphone Notes**: Web Speech API requires HTTPS for production (use on localhost for testing). On mobile, it prompts for permission. Test in Chrome/Android or Safari/iOS.
- **Terminal Input**: Users can type or speak commands. Spoken commands are sent as if typed (with newline).

### Step 4: Test the Application
1. Start the server: `node server.js`.
2. Open `http://localhost:3000` in a browser (or on mobile via your computer's IP, e.g., `http://192.168.1.50:3000`).
3. The terminal should connect to your VM's shell.
4. Type commands or use the mic button to speak (e.g., say "ls" to list files).
5. On mobile: The UI scales automatically; mic works via device microphone.

If connection fails:
- Check VM IP/username/password.
- Ensure SSH is running on VM.
- Firewall: Allow port 22 on VM, port 3000 on host.

### Step 5: Enhancements and Security
- **Authentication**: Add login to frontend/backend before SSH connect (use express-session or JWT).
- **Error Handling**: Add socket events for SSH errors (e.g., `conn.on('error', ...)`).
- **Mobile Optimizations**: Add touch keyboard hide/show if needed (via meta tags).
- **Disconnects**: Handle WebSocket reconnects with socket.io's built-in retry.
- **VM Isolation**: Run VM commands in a restricted shell (e.g., rbash) to limit damage.
- **HTTPS**: For production, use Let's Encrypt or self-signed certs (update server to https).

### Step 6: Deployment
- **Local Network**: Run on a server in your network (e.g., Raspberry Pi). Use PM2 for daemon: `npm install -g pm2 && pm2 start server.js`.
- **Access from Mobile**: Use host machine's LAN IP. For remote access, consider VPN or port forwarding (with caution).
- **Scaling**: If multiple users, create per-user SSH sessions.

This should get your web terminal up and running. If you encounter issues, provide error logs for troubleshooting!