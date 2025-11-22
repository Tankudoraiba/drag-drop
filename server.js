const fs = require('fs');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/create', (req, res) => {
  const id = uuidv4();
  console.log(`Create session ${id}`);
  res.json({ id });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// sessions: id -> Set of sockets
const sessions = new Map();

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) { console.error('send error', e); }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  let sessionId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { console.warn('invalid json', e); return; }

    const { type } = msg;
    if (type === 'join') {
      sessionId = msg.session;
      if (!sessionId) return send(ws, { type: 'error', message: 'no session' });
      if (!sessions.has(sessionId)) sessions.set(sessionId, new Set());
      const set = sessions.get(sessionId);
      if (set.size >= 2) {
        return send(ws, { type: 'full' });
      }
      set.add(ws);
      console.log(`Socket joined ${sessionId} (count=${set.size})`);
      send(ws, { type: 'joined', peers: set.size });
      // notify others
      set.forEach(s => {
        if (s !== ws) send(s, { type: 'peer-joined' });
      });
      return;
    }

    // debug logs from client
    if (type === 'log') {
      console.log(`[log ${sessionId || '-'}]`, msg.level || 'info', msg.msg || msg);
      return;
    }

    // Relay signaling messages (offer/answer/ice)
    if (['offer','answer','ice'].includes(type)) {
      if (!sessionId) return send(ws, { type: 'error', message: 'not joined' });
      const set = sessions.get(sessionId) || new Set();
      set.forEach(s => { if (s !== ws) send(s, msg); });
      return;
    }

  });

  ws.on('close', () => {
    if (sessionId && sessions.has(sessionId)) {
      const set = sessions.get(sessionId);
      set.delete(ws);
      set.forEach(s => send(s, { type: 'peer-left' }));
      if (set.size === 0) sessions.delete(sessionId);
      console.log(`Socket left ${sessionId} (count=${set.size})`);
    }
  });
});

// Periodic ping to keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

server.listen(PORT, () => console.log(`Server listening on http://0.0.0.0:${PORT}`));

process.on('SIGINT', () => process.exit());
