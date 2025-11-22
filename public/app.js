/* Simple client-side signaling and WebRTC file transfer */
const logEl = document.getElementById('log');
function log(...args){
  const s = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  console.log(...args);
  const p = document.createElement('div'); p.textContent = `[${new Date().toLocaleTimeString()}] ${s}`; logEl.appendChild(p); logEl.scrollTop = logEl.scrollHeight;
}

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const linkOut = document.getElementById('linkOut');
const fileInput = document.getElementById('fileInput');
const progress = document.getElementById('progress');

let ws;
let pc;
let dataChannel;
let isCreator = false;
let roomId = null;

const CHUNK_SIZE = 64 * 1024;

function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}`;
  ws = new WebSocket(url);
  ws.addEventListener('open', () => log('ws open'));
  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handleSignal(data);
    } catch (e) {
      log('ws msg non-json');
    }
  });
  ws.addEventListener('close', () => log('ws closed'));
}

function sendSignal(obj){
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(obj));
}

function handleSignal(msg){
  log('signal', msg.type || '', msg);
  if (msg.type === 'peer-joined') {
    // other peer joined
    if (isCreator) startOffer();
  } else if (msg.type === 'offer' && !isCreator) {
    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(async () => {
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      sendSignal({ type: 'answer', sdp: pc.localDescription });
    });
  } else if (msg.type === 'answer' && isCreator) {
    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).catch(log);
  } else if (msg.type === 'candidate') {
    const c = msg.candidate;
    if (c) pc.addIceCandidate(new RTCIceCandidate(c)).catch(log);
  } else if (msg.type === 'peer-left') {
    log('Peer left');
  }
}

function makePC(){
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  pc = new RTCPeerConnection(config);
  pc.onicecandidate = (e) => { if (e.candidate) sendSignal({ type: 'candidate', candidate: e.candidate }); };
  pc.ondatachannel = (e) => {
    log('datachannel incoming', e.channel.label);
    setupDataChannel(e.channel, false);
  };
}

function setupDataChannel(dc, isSender){
  dataChannel = dc;
  dataChannel.binaryType = 'arraybuffer';
  if (!isSender) {
    let fileName = null; let fileSize = 0; let receivedBuffers = [];
    dataChannel.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const obj = JSON.parse(ev.data);
          if (obj.type === 'meta') { fileName = obj.name; fileSize = obj.size; receivedBuffers = []; progress.value = 0; log('Receiving', fileName, fileSize); }
          if (obj.type === 'done') {
            const blob = new Blob(receivedBuffers);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = fileName || 'file'; a.textContent = `Pobierz ${fileName}`; a.style.display='block'; log('File ready, click to download:'); log(a.outerHTML); const wrapper = document.createElement('div'); wrapper.appendChild(a); logEl.appendChild(wrapper);
          }
        } catch (e) { log('str parse error', e); }
      } else {
        receivedBuffers.push(ev.data);
        if (fileSize) { const receivedSize = receivedBuffers.reduce((s,b)=>s+b.byteLength,0); progress.value = Math.floor(receivedSize*100/fileSize); }
      }
    };
  } else {
    // sender side doesn't need onmessage
    dataChannel.onopen = () => log('DataChannel open');
    dataChannel.onclose = () => log('DataChannel closed');
  }
}

async function startOffer(){
  makePC();
  // create data channel as sender
  const dc = pc.createDataChannel('file');
  setupDataChannel(dc, true);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal({ type: 'offer', sdp: pc.localDescription });
}

createBtn.addEventListener('click', () => {
  isCreator = true;
  roomId = Math.random().toString(36).slice(2,10);
  connectWS();
  ws.addEventListener('open', () => { sendSignal({ type: 'join', room: roomId }); });
  const link = `${location.origin}/?room=${roomId}`;
  linkOut.textContent = link;
  roomInput.value = link;
  log('Created session', roomId);
  // create pc early
  makePC();
});

joinBtn.addEventListener('click', () => {
  isCreator = false;
  // read room from input - allow full link or id
  let v = roomInput.value.trim();
  if (v.indexOf('?room=') !== -1) {
    v = v.split('?room=')[1];
  }
  roomId = v;
  if (!roomId) { alert('Podaj id sesji lub link'); return; }
  connectWS();
  ws.addEventListener('open', () => { sendSignal({ type: 'join', room: roomId }); });
  log('Joined session', roomId);
  makePC();
});

fileInput.addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; if (!file) return;
  if (!isCreator) { alert('Tylko twórca sesji (A) może wysyłać w tej wersji'); return; }
  if (!dataChannel || dataChannel.readyState !== 'open') {
    log('Data channel not open yet, attempting to start offer');
    // try to (re)start
    if (!pc) await startOffer();
    // wait for channel open
    await new Promise(r => setTimeout(r, 500));
  }
  log('Sending file', file.name, file.size);
  // send metadata
  dataChannel.send(JSON.stringify({ type: 'meta', name: file.name, size: file.size }));
  const stream = file.stream ? file.stream() : null;
  if (stream) {
    // modern browsers: stream
    const reader = stream.getReader();
    let sent = 0;
    while(true){
      const { done, value } = await reader.read();
      if (done) break;
      dataChannel.send(value);
      sent += value.byteLength;
      progress.value = Math.floor(sent*100/file.size);
    }
  } else {
    // fallback to slice
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const ab = await slice.arrayBuffer();
      dataChannel.send(ab);
      offset += ab.byteLength;
      progress.value = Math.floor(offset*100/file.size);
    }
  }
  dataChannel.send(JSON.stringify({ type: 'done' }));
  log('Send complete');
});

// If page opened with ?room=..., prefill
(() => {
  try {
    const params = new URLSearchParams(location.search);
    const r = params.get('room');
    if (r) roomInput.value = r;
  } catch(e){}
})();

// send client logs to server too
setInterval(()=>{ if (ws && ws.readyState===WebSocket.OPEN) sendSignal({ type:'log', message:'client-alive' }); }, 30000);
