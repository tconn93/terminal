# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web-based terminal that SSH-connects to a VM and exposes it in the browser. Key feature: each browser session is backed by a **named tmux session on the VM**, so processes keep running even when the browser closes or the connection drops.

**Tech Stack:** Node.js + Express + Socket.IO + ssh2 (backend), xterm.js + Web Speech API (frontend)

**VM requirement:** `tmux` must be installed on the VM (`apt install tmux`).

## Session Persistence Architecture

This is the core design pattern — understand it before touching `server.js` or `app.js`.

1. On first connect, the backend generates a UUID `sessionId` and derives a short tmux name (`ws-` + first 10 hex chars).
2. The `sessions` Map (`sessionId → tmuxName`) is stored **in-memory** — it is lost when the server restarts.
3. The backend runs `tmux new-session -A -s <tmuxName>` via `conn.exec` with a PTY (not `conn.shell`). The `-A` flag attaches to an existing session or creates one.
4. The frontend saves `sessionId` in `localStorage` and passes it via Socket.IO `auth` on every connection.
5. On reconnect, the backend looks up the `sessionId` in `sessions`, finds the same `tmuxName`, and attaches to the still-running tmux session.
6. When the browser sends `new-session`, the backend kills the old tmux session via a separate SSH connection and starts fresh.

**Implication:** Clearing `localStorage` or restarting the server abandons the tmux session on the VM (it keeps running but becomes unreachable through this app until manually killed with `tmux kill-session`).

## WebSocket Events

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| client → server | `data` | string | Keyboard/voice input to SSH stream |
| client → server | `resize` | `{cols, rows}` | Terminal resize → `stream.setWindow()` |
| client → server | `new-session` | — | Kill current tmux session, start fresh |
| server → client | `data` | string | VM output to xterm.js |
| server → client | `session-created` | sessionId | New session established |
| server → client | `session-resumed` | sessionId | Existing tmux session reattached |
| server → client | `ssh-error` | string | SSH connection failure message |

## Environment Configuration

`.env` file (never commit):
```
VM_HOST=<VM IP address>
VM_PORT=22
VM_USER=<SSH username>
VM_PWORD=<SSH password>
PORT=3000  # optional
```

## Development Commands

```bash
npm install       # install dependencies
node server.js    # start server at http://localhost:3000
```

No build step — frontend files in `public/` are served statically.

**Mobile testing:** access via the host machine's LAN IP: `http://<HOST_IP>:3000`

**Production:**
```bash
npm install -g pm2
pm2 start server.js --name terminal
pm2 save && pm2 startup
```

## Frontend Toolbar

The mobile toolbar (`index.html`) provides buttons that emit hardcoded escape sequences:
- **Ctrl** — toggles `ctrlActive` flag; next letter keystroke sends `\x01`–`\x1a` (Ctrl+A through Ctrl+Z)
- **Arrow buttons** — emit `\x1b[A/B/C/D`
- **`.` `/` `~`** — emit literal characters
- **New Session** — confirms with user, clears localStorage, emits `new-session`

## Speech-to-Text

Uses `SpeechRecognition` / `webkitSpeechRecognition`. Appends `\r\n` to the transcript before sending (simulates Enter). Requires HTTPS in production — works on `localhost` without it.
