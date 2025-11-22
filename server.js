const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

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

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.roomId = null;

  ws.on('message', (message, isBinary) => {
    // If this is a binary frame, forward it directly to the other peer
    if (isBinary) {
      if (ws.roomId && rooms.has(ws.roomId)) {
        const arr = rooms.get(ws.roomId);
        const other = arr.find((s) => s !== ws);
        if (other && other.readyState === WebSocket.OPEN) {
          try {
            other.send(message, { binary: true });
          } catch (e) {
            console.error('forward binary error', e);
          }
        }
      }
      return;
    }

    // text frame: try parse JSON for signaling/control
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.warn('invalid json', e);
      return;
    }

    const { type, roomId, payload } = data;

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
      }
    }
  });

  ws.on('close', () => {
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
