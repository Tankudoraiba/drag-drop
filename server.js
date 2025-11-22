const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// In-memory session storage
const sessions = new Map();

// Logging utility
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handling
wss.on('connection', (ws) => {
  log('New WebSocket connection');
  
  let currentSessionId = null;
  let currentClientId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      log('Received message', { type: data.type, sessionId: data.sessionId });

      switch (data.type) {
        case 'create-session':
          handleCreateSession(ws, data);
          break;
        
        case 'join-session':
          handleJoinSession(ws, data);
          break;
        
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          handleSignaling(ws, data);
          break;
        
        default:
          log('Unknown message type', { type: data.type });
      }
    } catch (error) {
      log('Error processing message', { error: error.message });
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    log('WebSocket connection closed', { sessionId: currentSessionId, clientId: currentClientId });
    
    // Clean up session if needed
    if (currentSessionId && sessions.has(currentSessionId)) {
      const session = sessions.get(currentSessionId);
      
      // Remove this client from the session
      if (session.creator === ws) {
        session.creator = null;
      }
      if (session.joiner === ws) {
        session.joiner = null;
      }
      
      // Notify the other peer about disconnection
      if (session.creator) {
        session.creator.send(JSON.stringify({ type: 'peer-disconnected' }));
      }
      if (session.joiner) {
        session.joiner.send(JSON.stringify({ type: 'peer-disconnected' }));
      }
      
      // Delete session if both peers are gone
      if (!session.creator && !session.joiner) {
        sessions.delete(currentSessionId);
        log('Session deleted', { sessionId: currentSessionId });
      }
    }
  });

  function handleCreateSession(ws, data) {
    const sessionId = generateSessionId();
    currentSessionId = sessionId;
    currentClientId = 'creator';
    
    sessions.set(sessionId, {
      id: sessionId,
      creator: ws,
      joiner: null,
      createdAt: Date.now()
    });
    
    log('Session created', { sessionId });
    
    ws.send(JSON.stringify({
      type: 'session-created',
      sessionId: sessionId
    }));
  }

  function handleJoinSession(ws, data) {
    const sessionId = data.sessionId;
    currentSessionId = sessionId;
    currentClientId = 'joiner';
    
    if (!sessions.has(sessionId)) {
      log('Session not found', { sessionId });
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Session not found'
      }));
      return;
    }
    
    const session = sessions.get(sessionId);
    
    if (session.joiner) {
      log('Session already has a joiner', { sessionId });
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Session is full'
      }));
      return;
    }
    
    session.joiner = ws;
    log('Client joined session', { sessionId });
    
    ws.send(JSON.stringify({
      type: 'session-joined',
      sessionId: sessionId
    }));
    
    // Notify creator that joiner has connected
    if (session.creator) {
      session.creator.send(JSON.stringify({
        type: 'peer-joined'
      }));
    }
  }

  function handleSignaling(ws, data) {
    const sessionId = data.sessionId;
    
    if (!sessions.has(sessionId)) {
      log('Session not found for signaling', { sessionId });
      return;
    }
    
    const session = sessions.get(sessionId);
    let targetPeer = null;
    
    // Determine which peer to forward the message to
    if (session.creator === ws) {
      targetPeer = session.joiner;
    } else if (session.joiner === ws) {
      targetPeer = session.creator;
    }
    
    if (targetPeer && targetPeer.readyState === WebSocket.OPEN) {
      log('Forwarding signaling message', { type: data.type, sessionId });
      targetPeer.send(JSON.stringify(data));
    } else {
      log('Target peer not available', { sessionId });
    }
  }
});

// Generate unique session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Clean up old sessions (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > oneHour) {
      sessions.delete(sessionId);
      log('Old session cleaned up', { sessionId });
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

server.listen(PORT, '0.0.0.0', () => {
  log(`Server started on port ${PORT}`);
  log(`Access the application at http://localhost:${PORT}`);
});
