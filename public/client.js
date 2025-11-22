// WebRTC Configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Global variables
let ws = null;
let peerConnection = null;
let dataChannel = null;
let sessionId = null;
let isCreator = false;
let selectedFile = null;
let receivedChunks = [];
let receivedSize = 0;
let fileMetadata = null;

// DOM Elements
const startScreen = document.getElementById('start-screen');
const creatorScreen = document.getElementById('creator-screen');
const joinerScreen = document.getElementById('joiner-screen');
const errorScreen = document.getElementById('error-screen');

const createSessionBtn = document.getElementById('create-session-btn');
const sessionLinkInput = document.getElementById('session-link');
const copyLinkBtn = document.getElementById('copy-link-btn');
const fileInput = document.getElementById('file-input');
const sendFileBtn = document.getElementById('send-file-btn');
const retryBtn = document.getElementById('retry-btn');

const creatorStatus = document.getElementById('creator-status');
const joinerStatus = document.getElementById('joiner-status');
const connectionStatus = document.getElementById('connection-status');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkSessionInURL();
  setupEventListeners();
});

function setupEventListeners() {
  createSessionBtn.addEventListener('click', createSession);
  copyLinkBtn.addEventListener('click', copySessionLink);
  fileInput.addEventListener('change', handleFileSelect);
  sendFileBtn.addEventListener('click', sendFile);
  retryBtn.addEventListener('click', () => window.location.href = '/');
}

function checkSessionInURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('session');
  
  if (urlSessionId) {
    sessionId = urlSessionId;
    isCreator = false;
    joinSession(urlSessionId);
  }
}

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    updateConnectionStatus(true);
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    showError('Connection error. Please try again.');
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateConnectionStatus(false);
  };
}

function handleWebSocketMessage(data) {
  console.log('WebSocket message:', data.type);
  
  switch (data.type) {
    case 'session-created':
      handleSessionCreated(data);
      break;
    
    case 'session-joined':
      handleSessionJoined(data);
      break;
    
    case 'peer-joined':
      handlePeerJoined();
      break;
    
    case 'offer':
      handleOffer(data);
      break;
    
    case 'answer':
      handleAnswer(data);
      break;
    
    case 'ice-candidate':
      handleIceCandidate(data);
      break;
    
    case 'peer-disconnected':
      handlePeerDisconnected();
      break;
    
    case 'error':
      showError(data.message);
      break;
  }
}

// Session Management
function createSession() {
  isCreator = true;
  connectWebSocket();
  
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'create-session' }));
  };
}

function joinSession(sessionId) {
  connectWebSocket();
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'join-session',
      sessionId: sessionId
    }));
  };
  
  showScreen('joiner');
}

function handleSessionCreated(data) {
  sessionId = data.sessionId;
  const sessionUrl = `${window.location.origin}?session=${sessionId}`;
  
  sessionLinkInput.value = sessionUrl;
  showScreen('creator');
}

function handleSessionJoined(data) {
  console.log('Joined session:', data.sessionId);
  joinerStatus.innerHTML = '<p>✅ Connected to session. Waiting for peer...</p>';
}

function handlePeerJoined() {
  console.log('Peer joined');
  creatorStatus.innerHTML = '<p>✅ Recipient connected!</p>';
  
  // Creator initiates WebRTC connection
  initiatePeerConnection();
}

// WebRTC Connection
function initiatePeerConnection() {
  console.log('Initiating peer connection');
  
  peerConnection = new RTCPeerConnection(configuration);
  
  // Set up ICE candidate handler
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'ice-candidate',
        sessionId: sessionId,
        candidate: event.candidate
      }));
    }
  };
  
  // Monitor connection state
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'connected') {
      console.log('Peers connected!');
      if (isCreator) {
        document.getElementById('creator-transfer').classList.remove('hidden');
      }
    }
  };
  
  if (isCreator) {
    // Creator creates data channel
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    setupDataChannel();
    
    // Create and send offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        ws.send(JSON.stringify({
          type: 'offer',
          sessionId: sessionId,
          offer: peerConnection.localDescription
        }));
      })
      .catch(error => console.error('Error creating offer:', error));
  } else {
    // Joiner waits for data channel
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel();
      document.getElementById('joiner-transfer').classList.remove('hidden');
      joinerStatus.innerHTML = '<p>✅ Connected! Waiting for file...</p>';
    };
  }
}

function setupDataChannel() {
  dataChannel.binaryType = 'arraybuffer';
  
  dataChannel.onopen = () => {
    console.log('Data channel opened');
  };
  
  dataChannel.onclose = () => {
    console.log('Data channel closed');
  };
  
  dataChannel.onerror = (error) => {
    console.error('Data channel error:', error);
  };
  
  if (!isCreator) {
    dataChannel.onmessage = handleDataChannelMessage;
  }
}

function handleOffer(data) {
  console.log('Received offer');
  
  peerConnection = new RTCPeerConnection(configuration);
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'ice-candidate',
        sessionId: sessionId,
        candidate: event.candidate
      }));
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
  };
  
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
    document.getElementById('joiner-transfer').classList.remove('hidden');
    joinerStatus.innerHTML = '<p>✅ Connected! Waiting for file...</p>';
  };
  
  peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))
    .then(() => peerConnection.createAnswer())
    .then(answer => peerConnection.setLocalDescription(answer))
    .then(() => {
      ws.send(JSON.stringify({
        type: 'answer',
        sessionId: sessionId,
        answer: peerConnection.localDescription
      }));
    })
    .catch(error => console.error('Error handling offer:', error));
}

function handleAnswer(data) {
  console.log('Received answer');
  peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
    .catch(error => console.error('Error setting remote description:', error));
}

function handleIceCandidate(data) {
  console.log('Received ICE candidate');
  const candidate = new RTCIceCandidate(data.candidate);
  peerConnection.addIceCandidate(candidate)
    .catch(error => console.error('Error adding ICE candidate:', error));
}

function handlePeerDisconnected() {
  showError('Peer disconnected');
  if (peerConnection) {
    peerConnection.close();
  }
}

// File Transfer
function handleFileSelect(event) {
  selectedFile = event.target.files[0];
  if (selectedFile) {
    sendFileBtn.disabled = false;
    console.log('File selected:', selectedFile.name, selectedFile.size);
  }
}

function sendFile() {
  // Validate prerequisites for sending file
  if (!selectedFile) {
    alert('Please select a file first.');
    return;
  }
  
  if (!dataChannel) {
    alert('Connection not established. Please wait for the recipient to join.');
    return;
  }
  
  if (dataChannel.readyState !== 'open') {
    alert('Data channel is not ready. Connection state: ' + dataChannel.readyState);
    return;
  }
  
  sendFileBtn.disabled = true;
  
  // Send file metadata first
  const metadata = {
    type: 'metadata',
    name: selectedFile.name,
    size: selectedFile.size,
    mimeType: selectedFile.type
  };
  
  dataChannel.send(JSON.stringify(metadata));
  
  // Show progress
  const progressContainer = document.getElementById('sender-progress');
  const fileInfo = progressContainer.querySelector('.file-info');
  const progressFill = progressContainer.querySelector('.progress-fill');
  const progressText = progressContainer.querySelector('.progress-text');
  
  progressContainer.classList.remove('hidden');
  fileInfo.textContent = `Sending: ${selectedFile.name} (${formatBytes(selectedFile.size)})`;
  
  // Read and send file in chunks
  // 16KB is a good balance between memory usage and transfer speed
  // Larger chunks may cause buffering issues, smaller chunks add overhead
  const chunkSize = 16384; // 16KB chunks (recommended for WebRTC DataChannel)
  let offset = 0;
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    
    const progress = (offset / selectedFile.size) * 100;
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}%`;
    
    if (offset < selectedFile.size) {
      readSlice(offset);
    } else {
      console.log('File sent successfully');
      dataChannel.send(JSON.stringify({ type: 'end' }));
      progressText.textContent = '100% - Sent!';
    }
  };
  
  function readSlice(offset) {
    const slice = selectedFile.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  }
  
  readSlice(0);
}

function handleDataChannelMessage(event) {
  if (typeof event.data === 'string') {
    const message = JSON.parse(event.data);
    
    if (message.type === 'metadata') {
      // Received file metadata
      fileMetadata = message;
      receivedChunks = [];
      receivedSize = 0;
      
      const progressContainer = document.getElementById('receiver-progress');
      const fileInfo = progressContainer.querySelector('.file-info');
      
      progressContainer.classList.remove('hidden');
      fileInfo.textContent = `Receiving: ${message.name} (${formatBytes(message.size)})`;
      
      console.log('Receiving file:', message.name, message.size);
    } else if (message.type === 'end') {
      // File transfer complete
      console.log('File received successfully');
      assembleFile();
    }
  } else {
    // Received file chunk
    receivedChunks.push(event.data);
    receivedSize += event.data.byteLength;
    
    const progress = (receivedSize / fileMetadata.size) * 100;
    const progressFill = document.querySelector('#receiver-progress .progress-fill');
    const progressText = document.querySelector('#receiver-progress .progress-text');
    
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}%`;
  }
}

function assembleFile() {
  const blob = new Blob(receivedChunks, { type: fileMetadata.mimeType });
  
  const downloadBtn = document.getElementById('download-btn');
  const downloadContainer = document.getElementById('download-container');
  
  downloadContainer.classList.remove('hidden');
  
  downloadBtn.onclick = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileMetadata.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}

// UI Functions
function showScreen(screen) {
  startScreen.classList.add('hidden');
  creatorScreen.classList.add('hidden');
  joinerScreen.classList.add('hidden');
  errorScreen.classList.add('hidden');
  
  switch (screen) {
    case 'start':
      startScreen.classList.remove('hidden');
      break;
    case 'creator':
      creatorScreen.classList.remove('hidden');
      break;
    case 'joiner':
      joinerScreen.classList.remove('hidden');
      break;
    case 'error':
      errorScreen.classList.remove('hidden');
      break;
  }
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showScreen('error');
}

function updateConnectionStatus(connected) {
  const indicator = connectionStatus.querySelector('.status-indicator');
  const text = connectionStatus.querySelector('.status-text');
  
  if (connected) {
    indicator.classList.remove('offline');
    indicator.classList.add('online');
    text.textContent = 'Connected';
  } else {
    indicator.classList.remove('online');
    indicator.classList.add('offline');
    text.textContent = 'Disconnected';
  }
}

function copySessionLink() {
  const linkText = sessionLinkInput.value;
  const originalText = copyLinkBtn.textContent;
  
  // Use modern Clipboard API with fallback for older browsers
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(linkText)
      .then(() => {
        copyLinkBtn.textContent = '✅ Copied!';
        setTimeout(() => {
          copyLinkBtn.textContent = originalText;
        }, 2000);
      })
      .catch(() => {
        // Fallback to deprecated method if modern API fails
        fallbackCopy();
      });
  } else {
    // Fallback for older browsers
    fallbackCopy();
  }
  
  function fallbackCopy() {
    sessionLinkInput.select();
    try {
      // Note: document.execCommand('copy') is deprecated but kept as fallback
      // for older browsers that don't support navigator.clipboard API
      document.execCommand('copy');
      copyLinkBtn.textContent = '✅ Copied!';
      setTimeout(() => {
        copyLinkBtn.textContent = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
