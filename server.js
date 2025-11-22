const fs = require('fs');
const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// create HTTP or HTTPS server depending on env
let server;
if (process.env.USE_HTTPS === '1' && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  try {
    const https = require('https');
    const options = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH)
    };
    server = https.createServer(options, app);
    console.log('Starting HTTPS server');
  } catch (err) {
    console.error('Failed to start HTTPS server:', err);
    process.exit(1);
  }
} else {
  const http = require('http');
  server = http.createServer(app);
  console.log('Starting HTTP server');
}

// Simple in-memory rooms: roomId -> Set of ws
const rooms = new Map();

const wss = new WebSocket.Server({ server });

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

wss.on('connection', (ws, req) => {
  ws.id = uuidv4();
  ws.room = null;
  log('Client connected', ws.id);

  ws.on('message', (message) => {
    // Expect signaling messages as JSON strings
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      log('Non-JSON message from', ws.id);
      return;
    }

    const { type, room } = data;
    if (type === 'join') {
      ws.room = room;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      log('Client', ws.id, 'joined room', room, 'size=', rooms.get(room).size);
      // Notify others in room
      for (const peer of rooms.get(room)) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: 'peer-joined', id: ws.id }));
        }
      }
    } else if (type === 'leave') {
      const r = ws.room;
      if (r && rooms.has(r)) {
        rooms.get(r).delete(ws);
        log('Client', ws.id, 'left room', r);
      }
      ws.room = null;
    } else if (type === 'log') {
      log('Client log', ws.id, data.message);
    } else {
      // Relay signaling messages to other peers in same room
      const r = ws.room || room;
      if (!r || !rooms.has(r)) return;
      for (const peer of rooms.get(r)) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ from: ws.id, ...data }));
        }
      }
    }
  });

  ws.on('close', () => {
    const r = ws.room;
    if (r && rooms.has(r)) {
      rooms.get(r).delete(ws);
      for (const peer of rooms.get(r)) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: 'peer-left', id: ws.id }));
        }
      }
      log('Client disconnected', ws.id, 'from room', r, 'remaining=', rooms.get(r).size);
    } else {
      log('Client disconnected', ws.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
