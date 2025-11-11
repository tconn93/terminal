# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web-based terminal application that connects to a VM over SSH via a local network. Features responsive mobile UI, real-time terminal interaction via WebSockets, and speech-to-text input using Web Speech API.

**Tech Stack:**
- Backend: Node.js, Express, Socket.IO, ssh2
- Frontend: xterm.js, Socket.IO client, Web Speech API
- Target: Mobile-first responsive design

## Architecture

### Three-Layer Communication Flow
1. **Frontend (public/)**: xterm.js terminal UI + Socket.IO client connects to backend WebSocket
2. **Backend (server.js)**: Express server relays WebSocket messages between frontend and SSH connection
3. **VM Connection**: ssh2 library establishes SSH shell session to remote VM

**Key Pattern**: Bidirectional data relay
- User input (keyboard/voice) → WebSocket → SSH stream → VM
- VM output → SSH stream → WebSocket → xterm.js display

### File Structure
```
/
├── server.js              # Backend: Express + Socket.IO + SSH relay
├── public/
│   ├── index.html         # Terminal UI container
│   ├── style.css          # Mobile-responsive styling
│   └── app.js             # Frontend: xterm.js + WebSocket + Speech API
└── .env                   # VM credentials (VM_HOST, VM_PORT, VM_USER, VM_PWORD)
```

## Environment Configuration

**CRITICAL**: Never hardcode VM credentials. Always use `.env` file:
```
VM_HOST=[VM IP address]
VM_PORT=[SSH port, default 22]
VM_USER=[SSH username]
VM_PWORD=[SSH password]
```

Backend must load these via `process.env.VM_HOST`, etc. (requires `dotenv` package).

## Development Commands

### Setup
```bash
npm install express socket.io ssh2 dotenv  # Core dependencies
mkdir public                                # Frontend files directory
```

### Running
```bash
node server.js                              # Start on http://localhost:3000
```

### Mobile Testing
Access from mobile device using host machine's LAN IP:
```
http://[HOST_IP]:3000  # e.g., http://192.168.1.50:3000
```

### Production Deployment
```bash
npm install -g pm2
pm2 start server.js                         # Daemonize server
```

## Security Requirements

1. **Credentials**: Use environment variables or SSH key-based auth (privateKey option in ssh2)
2. **HTTPS**: Required for Web Speech API in production (use Let's Encrypt or self-signed certs)
3. **Authentication**: Add user login before SSH connection (express-session or JWT)
4. **Error Handling**: Implement `conn.on('error')` handlers for SSH failures
5. **VM Isolation**: Consider restricted shell (rbash) on VM to limit command scope

## Speech-to-Text Implementation

- Uses browser's native Web Speech API (SpeechRecognition/webkitSpeechRecognition)
- Requires HTTPS in production (works on localhost for dev)
- Mobile support: Chrome/Android and Safari/iOS prompt for mic permissions
- Commands are sent as text with `\r\n` appended (simulates Enter key)

## WebSocket Event Flow

**Frontend → Backend:**
- `data`: User input (keyboard or transcribed speech)

**Backend → Frontend:**
- `data`: VM output to display in terminal

**Backend → VM:**
- SSH stream writes (via ssh2 Client)

**VM → Backend:**
- SSH stream reads (via ssh2 shell stream)

## Mobile Optimization Notes

- Terminal uses `term.fit()` for auto-resizing on window resize
- Mic button sized larger on mobile (`@media max-width: 768px`)
- Viewport meta tag ensures proper scaling: `width=device-width, initial-scale=1.0`

## Known Limitations

- Single SSH session per WebSocket connection (one user per connection)
- No reconnect logic for dropped SSH connections (implement in `conn.on('close')`)
- Speech API requires explicit user interaction to start (browser security policy)