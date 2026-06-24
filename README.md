# terminal

A web-based terminal that connects to a VM over SSH, accessible from any browser including mobile. Features real-time terminal emulation via WebSockets, tmux session persistence, and speech-to-text input.

## Features

- Full terminal emulation via [xterm.js](https://xtermjs.org/)
- SSH relay over WebSockets (Socket.IO)
- tmux session persistence — terminal keeps running when you close the browser
- Session resume on reconnect
- Speech-to-text input via the Web Speech API
- Mobile-friendly UI with on-screen arrow keys, Ctrl, and common characters

## Prerequisites

- **Node.js** v18+
- **npm**
- A VM accessible over SSH (LAN or remote)
- **tmux** installed on the VM (`apt install tmux` / `brew install tmux`)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/tconn93/terminal.git
cd terminal
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
VM_HOST=192.168.1.100   # IP address of your VM
VM_PORT=22              # SSH port (default: 22)
VM_USER=youruser        # SSH username
VM_PWORD=yourpassword   # SSH password
PORT=3000               # Web server port (optional, default: 3000)
```

> **Never commit `.env` to version control.** It is already listed in `.gitignore`.

### 3. Start the server

```bash
node server.js
```

Open `http://localhost:3000` in your browser.

---

## Deployment

### Option 1 — Local network (recommended for home/lab use)

Run the server on any machine on your LAN (e.g. a Raspberry Pi or always-on desktop).

```bash
npm install
node server.js
```

Access it from any device on the same network using the host machine's LAN IP:

```
http://192.168.1.50:3000
```

To keep the server running after you close the terminal, use **PM2**:

```bash
npm install -g pm2
pm2 start server.js --name terminal
pm2 save              # persist across reboots
pm2 startup           # generate startup script (follow the printed command)
```

Useful PM2 commands:

```bash
pm2 status            # view running processes
pm2 logs terminal     # tail logs
pm2 restart terminal  # restart after config changes
pm2 stop terminal     # stop the server
```

---

### Option 2 — HTTPS (required for speech-to-text outside localhost)

The Web Speech API requires HTTPS in production. Two approaches:

#### A. Self-signed certificate (LAN only)

```bash
# Generate a self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=192.168.1.50"
```

Update `server.js` to use HTTPS:

```js
const https = require('https');
const fs    = require('fs');

const server = https.createServer(
  { key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') },
  app
);
```

Access via `https://192.168.1.50:3000`. The browser will show a certificate warning — accept it once.

#### B. Let's Encrypt (public domain)

If the host has a public domain name and port 443 open, use [Certbot](https://certbot.eff.org/):

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com
```

Then reference the generated certs in `server.js`:

```js
const server = https.createServer({
  key:  fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem'),
}, app);
```

Update `PORT` in `.env` to `443` (or run on 443 with `sudo`).

---

### Option 3 — Remote access via VPN or reverse tunnel

For access outside your LAN without exposing a port publicly:

**Tailscale (easiest):**

```bash
# Install on both the host machine and your client device
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Once connected, access the terminal using the Tailscale IP of the host. No port forwarding needed.

**cloudflared tunnel (no open ports):**

```bash
# Install cloudflared, then:
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a public `https://` URL you can use from anywhere.

---

## Project structure

```
terminal/
├── server.js          # Express + Socket.IO + SSH relay
├── public/
│   ├── index.html     # Terminal UI
│   ├── style.css      # Mobile-responsive styles
│   └── app.js         # xterm.js + WebSocket client + Speech API
├── .env               # VM credentials (not committed)
└── package.json
```

## How it works

1. Browser connects to the Node.js server over WebSocket (Socket.IO).
2. Server opens an SSH connection to the VM and runs `tmux new-session -A -s <id>`.
3. All terminal I/O is relayed between the browser and the tmux session.
4. When you disconnect, tmux keeps the session alive on the VM — reconnecting resumes exactly where you left off.

## Security notes

- Use SSH key authentication instead of a password when possible (set `privateKey` in the ssh2 config).
- Add a login layer (e.g. `express-session` + a simple password) before the terminal is exposed to anyone other than yourself.
- Restrict what the SSH user can do on the VM with a limited shell (`rbash`) or by scoping the user's permissions.
- On a public network, always use HTTPS and consider Tailscale or a VPN rather than open port forwarding.
