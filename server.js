const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const url = require('url');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// rooms: Map<roomId, Set<WebSocket>>
const rooms = new Map();

function safeLog(...args) {
  console.log(new Date().toISOString(), ...args);
}

wss.on('connection', (ws, req) => {
  // parse room from query string
  const parsed = url.parse(req.url, true);
  const room = (parsed.query && parsed.query.room) ? String(parsed.query.room) : 'default';
  safeLog('[ws] connection', room);

  if (!rooms.has(room)) rooms.set(room, new Set());
  const set = rooms.get(room);

  if (set.size >= 2) {
    safeLog('[ws] room full', room);
    ws.send(JSON.stringify({ type: 'error', message: 'room-full' }));
    ws.close();
    return;
  }

  set.add(ws);
  ws.room = room;

  // notify this client of join state
  try {
    ws.send(JSON.stringify({ type: 'joined', room, count: set.size }));
  } catch (e) {
    // ignore
  }

  ws.on('message', (message) => {
    // forward any signaling message to the other peer(s) in the same room
    // message expected to be a JSON string
    let parsedMsg = null;
    try {
      if (typeof message === 'string') parsedMsg = JSON.parse(message);
    } catch (err) {
      safeLog('[ws] message parse error', err && err.message);
    }

    safeLog('[ws] recv', room, parsedMsg && parsedMsg.type ? parsedMsg.type : typeof message);

    for (const peer of set) {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        try {
          peer.send(message);
        } catch (err) {
          safeLog('[ws] forward error', err && err.message);
        }
      }
    }
  });

  ws.on('close', () => {
    safeLog('[ws] disconnect', room);
    set.delete(ws);
    if (set.size === 0) rooms.delete(room);
  });

  ws.on('error', (err) => {
    safeLog('[ws] error', err && err.message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => safeLog('Server listening on', PORT));
