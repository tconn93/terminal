require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// In-memory map: sessionId -> tmuxName
// tmux sessions on the VM persist independently of SSH/socket connections,
// so apps keep running even when the browser disconnects.
const sessions = new Map();

function getSshConfig() {
  return {
    host: process.env.VM_HOST,
    port: parseInt(process.env.VM_PORT) || 22,
    username: process.env.VM_USER,
    password: process.env.VM_PWORD
  };
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const sshConfig = getSshConfig();
  if (!sshConfig.host || !sshConfig.username || !sshConfig.password) {
    socket.emit('ssh-error', 'Server configuration error: missing SSH credentials');
    return;
  }

  let conn = null;
  let stream = null;
  let sessionId = null;
  let tmuxName = null;

  function startSshConnection() {
    conn = new Client();

    conn.on('ready', () => {
      console.log('SSH connected, attaching to tmux session:', tmuxName);

      // Use exec with a PTY to attach directly to (or create) the named tmux session.
      // -A: if the session exists, attach to it; if not, create it.
      // Requires tmux >= 2.4 on the VM.
      conn.exec(`tmux new-session -A -s ${tmuxName}`, {
        pty: { term: 'xterm-256color', cols: 80, rows: 24 }
      }, (err, str) => {
        if (err) {
          console.error('Exec error:', err);
          socket.emit('ssh-error', 'Failed to attach to terminal session');
          return;
        }

        stream = str;

        stream.on('data', (data) => {
          socket.emit('data', data.toString('utf-8'));
        });

        stream.stderr.on('data', (data) => {
          socket.emit('data', data.toString('utf-8'));
        });

        stream.on('close', () => {
          console.log('Stream closed for session:', tmuxName);
          stream = null;
          conn.end();
        });
      });
    });

    conn.on('error', (err) => {
      console.error('SSH error:', err.message);
      socket.emit('ssh-error', 'SSH connection failed: ' + err.message);
    });

    conn.on('close', () => {
      // SSH closed, but the tmux session on the VM keeps running
      console.log('SSH connection closed, tmux session preserved:', tmuxName);
    });

    conn.connect(sshConfig);
  }

  // Determine session: resume existing or create new
  const requestedId = socket.handshake.auth.sessionId;
  if (requestedId && sessions.has(requestedId)) {
    sessionId = requestedId;
    tmuxName = sessions.get(sessionId);
    console.log('Resuming session:', sessionId, '-> tmux:', tmuxName);
    socket.emit('session-resumed', sessionId);
  } else {
    sessionId = randomUUID();
    tmuxName = 'ws-' + sessionId.replace(/-/g, '').slice(0, 10);
    sessions.set(sessionId, tmuxName);
    console.log('New session:', sessionId, '-> tmux:', tmuxName);
    socket.emit('session-created', sessionId);
  }

  startSshConnection();

  socket.on('data', (data) => {
    if (stream) stream.write(data);
  });

  socket.on('resize', ({ cols, rows }) => {
    if (stream && cols && rows) {
      stream.setWindow(rows, cols);
    }
  });

  // Client requested a brand-new terminal session
  socket.on('new-session', () => {
    console.log('New session requested, replacing:', sessionId);

    // Asynchronously kill the old tmux session on the VM
    const oldTmuxName = tmuxName;
    const killConn = new Client();
    killConn.on('ready', () => {
      killConn.exec(`tmux kill-session -t ${oldTmuxName} 2>/dev/null; true`, (err, ks) => {
        if (ks) { ks.on('close', () => killConn.end()); ks.resume(); }
        else killConn.end();
      });
    });
    killConn.on('error', () => {});
    killConn.connect(sshConfig);

    // Clean up current state
    sessions.delete(sessionId);
    if (conn) conn.end();
    stream = null;

    // Set up new session
    sessionId = randomUUID();
    tmuxName = 'ws-' + sessionId.replace(/-/g, '').slice(0, 10);
    sessions.set(sessionId, tmuxName);
    console.log('Created new session:', sessionId, '-> tmux:', tmuxName);
    socket.emit('session-created', sessionId);

    startSshConnection();
  });

  socket.on('disconnect', () => {
    // Close the SSH connection. The tmux session on the VM keeps running,
    // so any apps inside it continue uninterrupted.
    console.log('Client disconnected, tmux session preserved:', tmuxName);
    if (conn) conn.end();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
