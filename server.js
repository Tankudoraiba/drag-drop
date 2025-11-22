const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// Simple status endpoint for debugging: shows rooms and occupants
app.get('/status', (req, res) => {
  const out = {};
  for (const [roomId, arr] of rooms.entries()) {
    out[roomId] = arr.length;
  }
  res.json({ rooms: out });
});

// health endpoint for container healthchecks
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// rooms: { roomId: [ws, ws] }
const rooms = new Map();

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch (e) {
    console.error('send error', e);
  }
}

function log(...args) {
  const ts = new Date().toISOString();
  console.log(ts, ...args);
}

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.roomId = null;
  log('WS connected', { id: ws.id });

  ws.on('error', (err) => {
    log('WS error', { id: ws.id, err: err && err.message });
  });

  ws.on('message', (message, isBinary) => {
    // If this is a binary frame, forward it directly to the other peer
    if (isBinary) {
      log('binary frame received', { id: ws.id, roomId: ws.roomId, bytes: message && message.length ? message.length : (message && message.byteLength) });
      if (ws.roomId && rooms.has(ws.roomId)) {
        const arr = rooms.get(ws.roomId);
        const other = arr.find((s) => s !== ws);
        if (other && other.readyState === WebSocket.OPEN) {
          try {
            other.send(message, { binary: true });
            log('forwarded binary frame', { from: ws.id, to: other.id, roomId: ws.roomId });
          } catch (e) {
            log('forward binary error', { err: e && e.message });
          }
        } else {
          log('no peer to forward binary', { id: ws.id, roomId: ws.roomId });
        }
      } else {
        log('binary frame with no room', { id: ws.id });
      }
      return;
    }

    // text frame: try parse JSON for signaling/control
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (e) {
      log('invalid json', { id: ws.id, err: e && e.message });
      return;
    }

    const { type, roomId, payload } = data;
    log('msg', { id: ws.id, type, roomId, payloadSize: payload ? JSON.stringify(payload).length : 0 });

    if (type === 'join') {
      if (!roomId) return;
      ws.roomId = roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, []);
      const arr = rooms.get(roomId);
      if (arr.length >= 2) {
        send(ws, { type: 'full' });
        return;
      }
      arr.push(ws);
      send(ws, { type: arr.length === 1 ? 'created' : 'joined' });
      log('joined room', { id: ws.id, roomId, occupants: arr.length });
      // notify other peer if present
      if (arr.length === 2) {
        const other = arr.find((s) => s !== ws);
        if (other) send(other, { type: 'peer-connected' });
        send(ws, { type: 'peer-connected' });
      }
      return;
    }

    // relay signaling/control messages to the other peer in the same room
    if (ws.roomId && rooms.has(ws.roomId)) {
      const arr = rooms.get(ws.roomId);
      const other = arr.find((s) => s !== ws);
      if (other && other.readyState === WebSocket.OPEN) {
        send(other, { type, payload });
        log('relayed message', { from: ws.id, to: other.id, type, roomId: ws.roomId });
      } else {
        log('no peer to relay message', { id: ws.id, type, roomId: ws.roomId });
      }
    } else {
      log('message received but no room', { id: ws.id, type });
    }
  });

  ws.on('close', () => {
    log('WS close', { id: ws.id, roomId: ws.roomId });
    if (ws.roomId && rooms.has(ws.roomId)) {
      const arr = rooms.get(ws.roomId).filter((s) => s !== ws);
      if (arr.length === 0) rooms.delete(ws.roomId);
      else rooms.set(ws.roomId, arr);
      // notify remaining peer
      if (arr[0] && arr[0].readyState === WebSocket.OPEN) {
        send(arr[0], { type: 'peer-disconnected' });
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
