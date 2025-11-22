// Minimal WebRTC file transfer using DataChannel and a WebSocket-based signaling server.
(function(){
  const wsUrl = location.origin.replace(/^http/, 'ws');
  let ws;
  let pc;
  let dataChannel;
  let useWsRelay = false; // fallback: send file chunks over websocket when WebRTC fails
  let isCaller = false;
  let fileToSend = null;
  let receiveBuffer = [];
  let receivedBytes = 0;
  let expectedBytes = 0;
  let filename = '';

  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const roomInput = document.getElementById('roomInput');
  const linkSpan = document.getElementById('link');
  const statusEl = document.getElementById('status');
  const fileInput = document.getElementById('fileInput');
  const sendBtn = document.getElementById('sendBtn');
  const sendProgress = document.getElementById('sendProgress');
  const recvProgress = document.getElementById('recvProgress');
  const receiveInfo = document.getElementById('receiveInfo');

  const roomFromUrl = new URLSearchParams(location.search).get('room');
  if (roomFromUrl) roomInput.value = roomFromUrl;

  function connectWs() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(wsUrl);
    // prefer ArrayBuffer for binary frames
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', () => { console.log('WS open'); if (statusEl) statusEl.textContent = 'połączony'; });
    ws.addEventListener('message', async (ev) => {
      // handle binary frames (file chunks relayed by server)
      if (ev.data instanceof ArrayBuffer) {
        // treat as chunk
        receiveBuffer.push(ev.data);
        receivedBytes += ev.data.byteLength || 0;
        recvProgress.value = expectedBytes ? (receivedBytes / expectedBytes) * 100 : 0;
        if (expectedBytes && receivedBytes >= expectedBytes) {
          const blob = new Blob(receiveBuffer);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename || 'download';
          a.textContent = `Pobierz ${filename}`;
          receiveInfo.innerHTML = '';
          receiveInfo.appendChild(a);
          receiveBuffer = [];
          receivedBytes = 0;
          expectedBytes = 0;
          recvProgress.value = 0;
        }
        return;
      }

      let msg = null;
      try { msg = JSON.parse(ev.data); } catch(e){ console.warn('bad msg', e); return; }
      console.log('ws msg', msg);
      if (msg.type === 'created') { isCaller = true; }
      if (msg.type === 'created') { if (statusEl) statusEl.textContent = 'utworzono'; }
      if (msg.type === 'peer-connected') {
        if (isCaller) startCallAsCaller();
      }
      if (msg.type === 'joined') { if (statusEl) statusEl.textContent = 'dołączono'; }
      if (msg.type === 'offer') {
        await ensurePc();
        await pc.setRemoteDescription(msg.payload);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', payload: pc.localDescription }));
      }
      if (msg.type === 'answer') {
        await pc.setRemoteDescription(msg.payload);
      }
      if (msg.type === 'ice') {
        try { await pc.addIceCandidate(msg.payload); } catch(e){ console.warn(e); }
      }
      if (msg.type === 'use-ws-relay') {
        // peer requested fallback to WS relay
        useWsRelay = true;
        console.log('Using WS relay fallback');
      }
      if (msg.type === 'file-meta') {
        // meta over ws relay
        filename = msg.payload && msg.payload.name ? msg.payload.name : '';
        expectedBytes = msg.payload && msg.payload.size ? msg.payload.size : 0;
        receiveBuffer = [];
        receivedBytes = 0;
        receiveInfo.textContent = `Odbieranie: ${filename} (${expectedBytes} B)`;
      }
      if (msg.type === 'full') alert('Sesja jest pełna (maks 2 osoby).');
      if (msg.type === 'peer-disconnected') {
        alert('Druga strona się rozłączyła');
        cleanupPeer();
      }
    });
    ws.addEventListener('close', () => { console.log('WS close'); if (statusEl) statusEl.textContent = 'rozłączony'; });
    ws.addEventListener('error', (e) => { console.log('WS error', e); if (statusEl) statusEl.textContent = 'błąd'; });
  }

  function ensurePc() {
    if (pc) return Promise.resolve(pc);
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = (ev) => {
      if (ev.candidate) ws.send(JSON.stringify({ type: 'ice', payload: ev.candidate }));
    };
    pc.ondatachannel = (ev) => {
      setupDataChannel(ev.channel);
    };
    // detect failures and trigger WS-relay fallback
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log('ICE state', s);
      if (s === 'failed' || s === 'disconnected') {
        // request fallback: inform the peer via signaling to use ws relay
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'use-ws-relay' }));
          useWsRelay = true;
          console.log('Requested WS relay fallback');
        }
      }
    };
    return Promise.resolve(pc);
  }

  function setupDataChannel(dc) {
    dataChannel = dc;
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.onopen = () => {
      console.log('DataChannel open');
      sendBtn.disabled = false;
    };
    dataChannel.onclose = () => { console.log('DataChannel closed'); sendBtn.disabled = true; };
    dataChannel.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        // control messages (json)
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'file-meta') {
            filename = m.name;
            expectedBytes = m.size;
            receiveBuffer = [];
            receivedBytes = 0;
            receiveInfo.textContent = `Odbieranie: ${filename} (${expectedBytes} B)`;
          }
        } catch(e){ console.warn('invalid control msg', e); }
      } else {
        // binary chunk
        receiveBuffer.push(ev.data);
        receivedBytes += ev.data.byteLength || ev.data.size || 0;
        recvProgress.value = expectedBytes ? (receivedBytes / expectedBytes) * 100 : 0;
        if (expectedBytes && receivedBytes >= expectedBytes) {
          const blob = new Blob(receiveBuffer);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename || 'download';
          a.textContent = `Pobierz ${filename}`;
          receiveInfo.innerHTML = '';
          receiveInfo.appendChild(a);
          // reset
          receiveBuffer = [];
          receivedBytes = 0;
          expectedBytes = 0;
          recvProgress.value = 0;
        }
      }
    };
  }

  async function startCallAsCaller() {
    await ensurePc();
    const dc = pc.createDataChannel('file');
    setupDataChannel(dc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', payload: pc.localDescription }));
  }

  function cleanupPeer() {
    if (dataChannel) { try { dataChannel.close(); } catch(e){} dataChannel = null; }
    if (pc) { try { pc.close(); } catch(e){} pc = null; }
    sendBtn.disabled = true;
  }

  // UI handlers
  createBtn.addEventListener('click', () => {
    const roomId = crypto.randomUUID();
    linkSpan.textContent = `${location.origin}${location.pathname}?room=${roomId}`;
    roomInput.value = roomId;
    // auto-connect and join
    connectWs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', roomId: roomId }));
    } else {
      ws.addEventListener('open', () => { ws.send(JSON.stringify({ type: 'join', roomId: roomId })); }, { once: true });
    }
  });

  joinBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (!roomId) return alert('Podaj ID sesji');
    connectWs();
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId }));
    }, { once: true });
  });

  // auto-join if room param present
  if (roomFromUrl) {
    joinBtn.click();
  }

  fileInput.addEventListener('change', () => {
    fileToSend = fileInput.files[0] || null;
    sendBtn.disabled = !fileToSend;
  });

  sendBtn.addEventListener('click', async () => {
    if (!fileToSend) return alert('Wybierz plik');

    const CHUNK_SIZE = 16 * 1024; // 16KB
    sendProgress.value = 0;
    let offset = 0;

    // If using WS relay fallback or no DataChannel available, send via websocket
    if (useWsRelay || !dataChannel || dataChannel.readyState !== 'open') {
      if (!ws || ws.readyState !== WebSocket.OPEN) return alert('Połączenie z serwerem (WS) nieaktywne');
      // send meta as control message
      ws.send(JSON.stringify({ type: 'file-meta', payload: { name: fileToSend.name, size: fileToSend.size, mime: fileToSend.type } }));
      while (offset < fileToSend.size) {
        const chunk = await fileToSend.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
        // send binary frame
        ws.send(chunk);
        offset += chunk.byteLength;
        sendProgress.value = (offset / fileToSend.size) * 100;
        // lightweight throttle
        if (ws.bufferedAmount > 16 * CHUNK_SIZE) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      alert('Wysłano plik (przez WS relay)');
      sendProgress.value = 0;
      return;
    }

    // otherwise use DataChannel
    while (offset < fileToSend.size) {
      const chunk = await fileToSend.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      // flow control
      if (dataChannel.bufferedAmount > 16 * CHUNK_SIZE) {
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      dataChannel.send(chunk);
      offset += chunk.byteLength;
      sendProgress.value = (offset / fileToSend.size) * 100;
    }

    alert('Wysłano plik (przez DataChannel)');
    sendProgress.value = 0;
  });

})();
