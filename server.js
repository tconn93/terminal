require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected');

  // SSH config from environment variables
  const sshConfig = {
    host: process.env.VM_HOST,
    port: parseInt(process.env.VM_PORT) || 22,
    username: process.env.VM_USER,
    password: process.env.VM_PWORD
  };

  // Validate SSH configuration
  if (!sshConfig.host || !sshConfig.username || !sshConfig.password) {
    console.error('Missing SSH configuration in .env file');
    socket.emit('error', 'Server configuration error');
    socket.disconnect();
    return;
  }

  const conn = new Client();
  let stream;

  conn.on('ready', () => {
    console.log('SSH connected');

    // Default terminal dimensions
    const shellOptions = {
      term: 'xterm-256color',
      cols: 80,
      rows: 24
    };

    conn.shell(shellOptions, (err, str) => {
      if (err) {
        console.error('Error opening shell:', err);
        socket.emit('error', 'Failed to open SSH shell');
        return;
      }

      stream = str;

      // Relay data from client to SSH
      socket.on('data', (data) => {
        stream.write(data);
      });

      // Handle terminal resize
      socket.on('resize', (dimensions) => {
        if (stream && dimensions.cols && dimensions.rows) {
          stream.setWindow(dimensions.rows, dimensions.cols);
        }
      });

      // Relay SSH output to client
      stream.on('data', (data) => {
        socket.emit('data', data.toString('utf-8'));
      });

      stream.on('close', () => {
        console.log('SSH stream closed');
        conn.end();
      });

      stream.stderr.on('data', (data) => {
        socket.emit('data', data.toString('utf-8'));
      });
    });
  });

  conn.on('error', (err) => {
    console.error('SSH connection error:', err);
    socket.emit('error', 'SSH connection failed: ' + err.message);
  });

  conn.on('close', () => {
    console.log('SSH connection closed');
    socket.disconnect();
  });

  conn.connect(sshConfig);

  socket.on('disconnect', () => {
    console.log('User disconnected');
    conn.end();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
