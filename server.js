require('dotenv').config();
const express = require('express');
const http = require('http');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Server } = require('socket.io');
const { Client } = require('ssh2');
const { randomUUID } = require('crypto');
const multer = require('multer');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// --- Body parsing for API routes ---
app.use(express.json());

// --- Multer for audio uploads (in-memory) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max audio
});

// --- Grok (XAI) API configuration ---
const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_STT_MODEL = process.env.XAI_STT_MODEL || 'grok-2';
const XAI_GENERATE_MODEL = process.env.XAI_GENERATE_MODEL || 'grok-3';
const XAI_AGENT_MODEL = process.env.XAI_AGENT_MODEL || 'grok-build-0.1';

// --- Session configuration ---
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'change-me-to-a-random-string',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,        // set true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
});

app.use(sessionMiddleware);

// --- Passport configuration ---
// Only configure Google OAuth if credentials are provided
const googleAuthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleAuthConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    // Accept any Google account — email restriction is handled by ensureAuth middleware
    const user = {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.emails && profile.emails[0] ? profile.emails[0].value : null
    };
    return done(null, user);
  }));
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());

// --- Auth guard middleware ---
function ensureAuth(req, res, next) {
  if (!googleAuthConfigured) {
    return res.redirect('/login');
  }
  if (req.isAuthenticated() && req.user && req.user.email === 'tyler@tyler.ag') {
    return next();
  }
  if (req.isAuthenticated()) {
    // Logged in but wrong email
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Access Denied</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
        .box { text-align: center; padding: 2rem; }
        h1 { color: #e74c3c; }
      </style>
      </head>
      <body>
        <div class="box">
          <h1>Access Denied</h1>
          <p>This terminal is restricted to authorized users only.</p>
          <p><a href="/logout" style="color:#3498db;">Log out</a></p>
        </div>
      </body>
      </html>
    `);
  }
  // Not logged in — redirect to Google OAuth
  res.redirect('/login');
}

// API auth guard — returns JSON errors instead of HTML redirects
function ensureAuthApi(req, res, next) {
  if (!googleAuthConfigured) {
    return res.status(401).json({ error: 'Authentication not configured' });
  }
  if (req.isAuthenticated() && req.user && req.user.email === 'tyler@tyler.ag') {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// --- Auth routes ---
// GET /login — trigger Google OAuth (or show setup needed if not configured)
app.get('/login', (req, res) => {
  if (!googleAuthConfigured) {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Auth Not Configured</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
        .box { text-align: left; padding: 2rem; max-width: 600px; }
        h1 { color: #e67e22; }
        code { background: #333; padding: 2px 6px; border-radius: 3px; }
        ol { line-height: 1.8; }
      </style>
      </head>
      <body>
        <div class="box">
          <h1>Google OAuth Not Configured</h1>
          <p>Set these environment variables in <code>.env</code> to enable login:</p>
          <ol>
            <li>Create a project at <a href="https://console.cloud.google.com/apis/credentials" style="color:#3498db;">Google Cloud Console</a></li>
            <li>Add an OAuth 2.0 Client ID (Web application)</li>
            <li>Set the authorized redirect URI to <code>http://localhost:3000/auth/google/callback</code></li>
            <li>Copy the Client ID and Client Secret into <code>.env</code>:
              <br><code>GOOGLE_CLIENT_ID=your-client-id</code>
              <br><code>GOOGLE_CLIENT_SECRET=your-client-secret</code>
              <br><code>SESSION_SECRET=any-random-string</code>
            </li>
            <li>Restart the server</li>
          </ol>
        </div>
      </body>
      </html>
    `);
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res);
});

// GET /auth/google/callback — Google redirects here after consent
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    if (req.user && req.user.email === 'tyler@tyler.ag') {
      return res.redirect('/');
    }
    // Wrong email — reject
    req.logout(() => {
      req.session.destroy(() => {
        res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Access Denied</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
            .box { text-align: center; padding: 2rem; }
            h1 { color: #e74c3c; }
          </style>
          </head>
          <body>
            <div class="box">
              <h1>Access Denied</h1>
              <p>This terminal is restricted to authorized users only.</p>
            </div>
          </body>
          </html>
        `);
      });
    });
  }
);

// GET /logout
app.get('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
});

// --- Grok API proxy routes ---

// POST /api/transcribe — audio to text via Grok STT
app.post('/api/transcribe', ensureAuthApi, upload.single('audio'), async (req, res) => {
  if (!XAI_API_KEY) {
    return res.status(503).json({ error: 'XAI_API_KEY not configured on server' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  try {
    // Native xAI STT endpoint — only needs the file, no model param
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('file', blob, 'recording.webm');

    const response = await fetch('https://api.x.ai/v1/stt', {
      method: 'POST',
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Grok STT error:', response.status, errText);
      return res.status(502).json({ error: `Grok STT failed: ${response.status}` });
    }

    const data = await response.json();
    res.json({ text: (data.text || '').trim() });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-command — convert natural language to shell commands via Grok
app.post('/api/generate-command', ensureAuthApi, async (req, res) => {
  if (!XAI_API_KEY) {
    return res.status(503).json({ error: 'XAI_API_KEY not configured on server' });
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: XAI_GENERATE_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a shell command generator. Convert the user\'s natural language request into raw shell commands. Output each command on its own line — they will be executed in sequence. No explanations, no markdown formatting, no code blocks, no quotes around commands, no "Here is the command", no emojis, nothing except the actual commands. Each line must be a valid shell command ready to paste into a terminal. For complex tasks, break them into individual sequential commands (one per line). If you need to chain dependent commands, use && on a single line. ALWAYS output at least one command.'
          },
          { role: 'user', content: text }
        ],
        temperature: 0,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Grok generate error:', response.status, errText);
      return res.status(502).json({ error: `Grok generate failed: ${response.status}` });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    // Parse response into individual commands (one per line, skip blanks and markdown artifacts)
    const commands = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('```') && !line.startsWith('#') && line !== '')
      // Strip any accidental markdown code fences
      .map(line => line.replace(/^```\w*\s*/, '').replace(/\s*```$/, ''))
      .filter(line => line.length > 0);

    res.json({ commands, raw });
  } catch (err) {
    console.error('Generate command error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent — agentic CLI loop: STT text → Grok with bash_command + write_file tools
app.post('/api/agent', ensureAuthApi, async (req, res) => {
  if (!XAI_API_KEY) {
    return res.status(503).json({ error: 'XAI_API_KEY not configured on server' });
  }

  const { text, sessionId } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const agentSocket = sessionId ? socketBySession.get(sessionId) : null;

  function execOnVM(command) {
    return new Promise((resolve) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return resolve({ stdout: '', stderr: err.message, exitCode: 1 });
          }
          stream.on('data', (chunk) => {
            const t = chunk.toString('utf-8');
            stdout += t;
            if (agentSocket) agentSocket.emit('data', t);
          });
          stream.stderr.on('data', (chunk) => {
            const t = chunk.toString('utf-8');
            stderr += t;
            if (agentSocket) agentSocket.emit('data', '\x1b[31m' + t + '\x1b[0m');
          });
          stream.on('close', (code) => {
            conn.end();
            resolve({ stdout, stderr, exitCode: code ?? 0 });
          });
        });
      });
      conn.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
      conn.connect(getSshConfig());
    });
  }

  function writeFileOnVM(filePath, content) {
    return new Promise((resolve) => {
      const conn = new Client();
      conn.on('ready', () => {
        const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
        conn.exec(`mkdir -p "${dir.replace(/"/g, '\\"')}"`, (err, mkStream) => {
          if (err) { conn.end(); return resolve({ stdout: '', stderr: err.message, exitCode: 1 }); }
          mkStream.on('close', () => {
            conn.sftp((sftpErr, sftp) => {
              if (sftpErr) { conn.end(); return resolve({ stdout: '', stderr: sftpErr.message, exitCode: 1 }); }
              const ws = sftp.createWriteStream(filePath);
              ws.on('error', (e) => { conn.end(); resolve({ stdout: '', stderr: e.message, exitCode: 1 }); });
              ws.on('finish', () => { conn.end(); resolve({ stdout: `Written: ${filePath}`, stderr: '', exitCode: 0 }); });
              ws.end(content, 'utf8');
            });
          });
          mkStream.resume();
        });
      });
      conn.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
      conn.connect(getSshConfig());
    });
  }

  // Responses API format: flat tool definitions (not nested under "function")
  const tools = [
    {
      type: 'function',
      name: 'bash_command',
      description: 'Execute a shell command on the remote Linux VM and return its output',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' }
        },
        required: ['command']
      }
    },
    {
      type: 'function',
      name: 'write_file',
      description: 'Write or overwrite a file on the remote Linux VM with the given content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'Content to write to the file' }
        },
        required: ['path', 'content']
      }
    }
  ];

  // Stateless multi-turn: accumulate input items each iteration
  const inputItems = [{ role: 'user', content: text }];

  try {
    const maxTurns = 10;
    let turns = 0;

    while (turns < maxTurns) {
      turns++;

      const grokResp = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${XAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: XAI_AGENT_MODEL,
          instructions: 'You are a CLI agent running on a remote Linux VM. Use bash_command to execute shell commands and write_file to create or modify files. Be efficient and direct. When the task is complete, briefly summarize what was done.',
          input: inputItems,
          tools
        })
      });

      if (!grokResp.ok) {
        const errText = await grokResp.text();
        console.error('Grok agent error:', grokResp.status, errText);
        return res.status(502).json({ error: `Grok agent error ${grokResp.status}: ${errText}` });
      }

      const grokData = await grokResp.json();
      const outputItems = grokData.output || [];

      const functionCalls = outputItems.filter(item => item.type === 'function_call');
      const messageItem = outputItems.find(item => item.type === 'message');

      // No function calls — agent is done
      if (functionCalls.length === 0) {
        const reply = messageItem?.content?.[0]?.text || 'Done.';
        if (agentSocket) agentSocket.emit('data', `\r\n\x1b[32m[Agent]\x1b[0m ${reply}\r\n`);
        return res.json({ response: reply, turns });
      }

      // Append model output to input for next turn
      inputItems.push(...outputItems);

      // Execute each function call and collect results
      for (const fc of functionCalls) {
        let args;
        try { args = JSON.parse(fc.arguments || '{}'); } catch (e) { args = {}; }

        let result;
        if (fc.name === 'bash_command') {
          if (agentSocket) agentSocket.emit('data', `\r\n\x1b[36m$ ${args.command}\x1b[0m\r\n`);
          const r = await execOnVM(args.command);
          result = `stdout:\n${r.stdout}\nstderr:\n${r.stderr}\nexit_code: ${r.exitCode}`;
        } else if (fc.name === 'write_file') {
          if (agentSocket) agentSocket.emit('data', `\r\n\x1b[33m[Writing: ${args.path}]\x1b[0m\r\n`);
          const r = await writeFileOnVM(args.path, args.content);
          result = r.exitCode === 0 ? `File written: ${args.path}` : `Write failed: ${r.stderr}`;
          if (agentSocket) agentSocket.emit('data', result + '\r\n');
        } else {
          result = `Unknown tool: ${fc.name}`;
        }

        inputItems.push({ type: 'function_call_output', call_id: fc.call_id, output: result });
      }
    }

    const msg = 'Max agent turns reached';
    if (agentSocket) agentSocket.emit('data', `\r\n\x1b[31m[Agent]\x1b[0m ${msg}\r\n`);
    return res.json({ response: msg, turns });
  } catch (err) {
    console.error('Agent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Public PWA assets (must be reachable before auth for install/offline to work) ---
app.get('/manifest.json', (req, res) => res.sendFile(__dirname + '/public/manifest.json'));
app.get('/sw.js', (req, res) => res.sendFile(__dirname + '/public/sw.js'));
app.get('/icon.svg', (req, res) => res.sendFile(__dirname + '/public/icon.svg'));

// --- Protected routes ---
app.get('/', ensureAuth, (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// All static files require authentication
app.use(ensureAuth);
app.use(express.static('public', {
  setHeaders: (res, path) => {
    // Prevent caching so auth state is always fresh
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// --- Socket.IO with session sharing ---
const io = new Server(server);

// Wrap express middleware for Socket.IO use
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

// Reject unauthenticated or unauthorized WebSocket connections
io.use((socket, next) => {
  if (socket.request.user && socket.request.user.email === 'tyler@tyler.ag') {
    return next();
  }
  next(new Error('unauthorized'));
});

// --- SSH / tmux session management ---
// In-memory map: sessionId -> tmuxName
// tmux sessions on the VM persist independently of SSH/socket connections,
// so apps keep running even when the browser disconnects.
const sessions = new Map();
const socketBySession = new Map(); // sessionId -> socket (for /api/agent tool use)

function getSshConfig() {
  return {
    host: process.env.VM_HOST,
    port: parseInt(process.env.VM_PORT) || 22,
    username: process.env.VM_USER,
    password: process.env.VM_PWORD
  };
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id,
    socket.request.user ? `(${socket.request.user.email})` : '');

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
  socketBySession.set(sessionId, socket);

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
    socketBySession.set(sessionId, socket);

    startSshConnection();
  });

  socket.on('disconnect', () => {
    // Close the SSH connection. The tmux session on the VM keeps running,
    // so any apps inside it continue uninterrupted.
    console.log('Client disconnected, tmux session preserved:', tmuxName);
    socketBySession.delete(sessionId);
    if (conn) conn.end();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
