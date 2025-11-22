// client.js - simple WebRTC DataChannel file transfer with HTTP (WebSocket) signaling

const logEl = document.getElementById('log');
function log(...args){
  console.log(...args);
  const line = document.createElement('div');
  line.textContent = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  logEl.prepend(line);
}

const createBtn = document.getElementById('createBtn');
const linkWrap = document.getElementById('linkWrap');
const sessionLink = document.getElementById('sessionLink');
const controls = document.getElementById('controls');
const fileInput = document.getElementById('fileInput');
const sendBtn = document.getElementById('sendBtn');
const sendProgress = document.getElementById('sendProgress');
const recvProgress = document.getElementById('recvProgress');
const sendPct = document.getElementById('sendPct');
const recvPct = document.getElementById('recvPct');
const downloadArea = document.getElementById('downloadArea');

let room = null;
let ws = null;
let pc = null;
let dc = null;
let isInitiator = false;

const CHUNK_SIZE = 16 * 1024; // 16KB

function generateId(){
  return Math.random().toString(36).substring(2,10);
}

function updateLinkUI(id){
  const url = new URL(location.href);
  url.searchParams.set('room', id);
  sessionLink.href = url.toString();
  sessionLink.textContent = url.toString();
  linkWrap.style.display = '';
  controls.style.display = '';
}

createBtn.addEventListener('click', () => {
  if (!room) {
    room = generateId();
    updateLinkUI(room);
    connectSignaling(room);
  }
});

// Auto-join when URL contains ?room=
const params = new URLSearchParams(location.search);
if (params.get('room')){
  room = params.get('room');
  updateLinkUI(room);
  connectSignaling(room);
}

function connectSignaling(r){
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws?room=${encodeURIComponent(r)}`;
  log('[signal] connecting', url);
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    log('[signal] open');
  });

  ws.addEventListener('message', async (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch (e) { msg = ev.data; }
    log('[signal] recv', msg && msg.type ? msg.type : typeof msg, msg);

    if (msg && msg.type === 'joined'){
      // if I'm the second to join, send 'ready' to trigger offer creation on other side
      if (msg.count === 2){
        // let the other peer create the offer by notifying them
        sendSignal({ type: 'ready' });
      }
    } else if (msg && msg.type === 'ready'){
      // other peer is ready -> create peer and offer
      await createPeer(true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: pc.localDescription });
    } else if (msg && msg.type === 'offer'){
      await createPeer(false);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ type: 'answer', sdp: pc.localDescription });
    } else if (msg && msg.type === 'answer'){
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    } else if (msg && msg.type === 'ice'){
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch (e) {
        log('[pc] addIceCandidate error', e && e.message);
      }
    } else if (msg && msg.type === 'error'){
      log('[signal] error', msg.message);
    }
  });

  ws.addEventListener('close', () => log('[signal] closed'));
  ws.addEventListener('error', (e) => log('[signal] error', e && e.message));
}

function sendSignal(obj){
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

async function createPeer(shouldCreateDataChannel){
  if (pc) return;
  log('[pc] creating RTCPeerConnection');
  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate });
  });

  pc.addEventListener('connectionstatechange', () => log('[pc] state', pc.connectionState));

  if (shouldCreateDataChannel){
    dc = pc.createDataChannel('file');
    setupDataChannel(dc);
  } else {
    pc.addEventListener('datachannel', (ev) => {
      dc = ev.channel;
      setupDataChannel(dc);
    });
  }
}

function setupDataChannel(channel){
  channel.binaryType = 'arraybuffer';
  channel.addEventListener('open', () => {
    log('[dc] open');
    sendBtn.disabled = false;
  });
  channel.addEventListener('close', () => { log('[dc] close'); sendBtn.disabled = true; });
  channel.addEventListener('error', (e) => log('[dc] error', e && e.message));

  // receiver state
  let incoming = { name: null, size: 0, received: 0, buffers: [] };

  channel.addEventListener('message', (ev) => {
    if (typeof ev.data === 'string'){
      try {
        const obj = JSON.parse(ev.data);
        if (obj.type === 'file-meta'){
          incoming.name = obj.name;
          incoming.size = obj.size;
          incoming.received = 0;
          incoming.buffers = [];
          recvProgress.value = 0; recvPct.textContent = '0%';
          log('[file] incoming', obj.name, obj.size);
        }
        if (obj.type === 'file-end'){
          // assemble
          const blob = new Blob(incoming.buffers);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = incoming.name || 'file.bin';
          a.textContent = `Pobierz ${incoming.name}`;
          downloadArea.innerHTML = '';
          downloadArea.appendChild(a);
          log('[file] received complete', incoming.name);
          incoming = { name: null, size: 0, received: 0, buffers: [] };
          recvProgress.value = 100; recvPct.textContent = '100%';
        }
      } catch (e) {
        log('[dc] string parse error', e && e.message);
      }
    } else if (ev.data instanceof ArrayBuffer){
      incoming.buffers.push(ev.data);
      incoming.received += ev.data.byteLength;
      if (incoming.size) {
        const p = Math.round((incoming.received / incoming.size) * 100);
        recvProgress.value = p; recvPct.textContent = p + '%';
      }
    }
  });
}

sendBtn.addEventListener('click', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return alert('Wybierz plik');
  if (!dc || dc.readyState !== 'open') return alert('Kanał nie jest otwarty');

  sendProgress.value = 0; sendPct.textContent = '0%';

  // send metadata
  dc.send(JSON.stringify({ type: 'file-meta', name: file.name, size: file.size }));

  const stream = file.stream();
  const reader = stream.getReader();
  let sent = 0;

  // backpressure-aware loop
  while (true){
    const { done, value } = await reader.read();
    if (done) break;
    // value is Uint8Array
    // wait if bufferedAmount high
    await waitForBufferLow(dc);
    dc.send(value.buffer);
    sent += value.byteLength;
    const p = Math.round((sent / file.size) * 100);
    sendProgress.value = p; sendPct.textContent = p + '%';
  }

  // notify end
  dc.send(JSON.stringify({ type: 'file-end' }));
  log('[file] send complete', file.name);
});

function waitForBufferLow(channel){
  const HIGH = 1024 * 1024 * 2; // 2MB
  return new Promise((resolve) => {
    if (channel.bufferedAmount <= HIGH) return resolve();
    const iv = setInterval(() => {
      if (channel.bufferedAmount <= HIGH) { clearInterval(iv); resolve(); }
    }, 50);
  });
}

fileInput.addEventListener('change', () => {
  sendBtn.disabled = !fileInput.files || fileInput.files.length === 0;
});

// simple UX logs
log('Got UI ready');
