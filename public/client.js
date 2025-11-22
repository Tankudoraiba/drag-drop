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
  let receiverReady = false; // handshake: receiver confirms ready to receive chunks

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
  const eventLog = document.getElementById('eventLog');

  function uiLog(msg) {
    try {
      const ts = new Date().toLocaleTimeString();
      const line = document.createElement('div');
      line.textContent = `[${ts}] ${msg}`;
      if (eventLog) {
        eventLog.appendChild(line);
        eventLog.scrollTop = eventLog.scrollHeight;
      }
      console.log(msg);
    } catch (e) { /* ignore */ }
  }

  const roomFromUrl = new URLSearchParams(location.search).get('room');
  if (roomFromUrl) roomInput.value = roomFromUrl;

  function connectWs() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(wsUrl);
    // prefer ArrayBuffer for binary frames
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', () => { uiLog('WS open'); if (statusEl) statusEl.textContent = 'połączony'; });
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
      try { msg = JSON.parse(ev.data); } catch(e){ uiLog('bad ws msg: ' + (e && e.message)); return; }
      uiLog('WS msg: ' + JSON.stringify(msg));
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
        uiLog('Using WS relay fallback');
      }
      if (msg.type === 'file-ready') {
        receiverReady = true;
        uiLog('Receiver ready (via WS)');
      }
      if (msg.type === 'file-meta') {
        // meta over ws relay
        filename = msg.payload && msg.payload.name ? msg.payload.name : '';
        expectedBytes = msg.payload && msg.payload.size ? msg.payload.size : 0;
        receiveBuffer = [];
        receivedBytes = 0;
        receiveInfo.textContent = `Odbieranie: ${filename} (${expectedBytes} B)`;
        // send ready ack back to sender (via WS)
        try { ws.send(JSON.stringify({ type: 'file-ready' })); uiLog('Sent file-ready (via WS)'); } catch (e) { uiLog('failed to send file-ready via WS: ' + (e && e.message)); }
      }
      if (msg.type === 'full') alert('Sesja jest pełna (maks 2 osoby).');
      if (msg.type === 'peer-disconnected') {
        alert('Druga strona się rozłączyła');
        cleanupPeer();
      }
    });
    ws.addEventListener('close', () => { uiLog('WS close'); if (statusEl) statusEl.textContent = 'rozłączony'; });
    ws.addEventListener('error', (e) => { uiLog('WS error: ' + (e && e.message)); if (statusEl) statusEl.textContent = 'błąd'; });
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
      uiLog('ICE state: ' + s);
      if (s === 'failed' || s === 'disconnected') {
        // request fallback: inform the peer via signaling to use ws relay
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'use-ws-relay' }));
          useWsRelay = true;
          uiLog('Requested WS relay fallback');
        }
      }
    };
    return Promise.resolve(pc);
  }

  function setupDataChannel(dc) {
    dataChannel = dc;
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.onopen = () => {
      uiLog('DataChannel open');
      sendBtn.disabled = false;
    };
    dataChannel.onclose = () => { uiLog('DataChannel closed'); sendBtn.disabled = true; };
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
            // send ready ack back to sender (via DataChannel)
            try { dataChannel.send(JSON.stringify({ type: 'file-ready' })); uiLog('Sent file-ready (via DataChannel)'); } catch (e) { uiLog('failed send file-ready: ' + (e && e.message)); }
          }
          if (m.type === 'file-ready') {
            receiverReady = true;
            uiLog('Receiver ready (via DataChannel)');
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
          uiLog('File received via DataChannel; ready for download: ' + a.download);
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
      uiLog('sending join for new room');
      ws.send(JSON.stringify({ type: 'join', roomId: roomId }));
    } else {
      ws.addEventListener('open', () => { uiLog('WS open; sending join for new room'); ws.send(JSON.stringify({ type: 'join', roomId: roomId })); }, { once: true });
    }
  });

  joinBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (!roomId) return alert('Podaj ID sesji');
    connectWs();
    ws.addEventListener('open', () => {
      uiLog('WS open; sending join');
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
      receiverReady = false;
      uiLog('Sending file-meta via WS: ' + fileToSend.name + ' ' + fileToSend.size + ' B');
      ws.send(JSON.stringify({ type: 'file-meta', payload: { name: fileToSend.name, size: fileToSend.size, mime: fileToSend.type } }));
      // wait for receiverReady (with timeout)
      const wsAckTimeout = 5000; // ms
      const wsStart = Date.now();
      while (!receiverReady && Date.now() - wsStart < wsAckTimeout) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (!receiverReady) uiLog('No file-ready ack received via WS; proceeding anyway');
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
        uiLog('Sent chunk via WS: ' + offset + '/' + fileToSend.size);
      }
      alert('Wysłano plik (przez WS relay)');
      uiLog('Finished sending file via WS');
      sendProgress.value = 0;
      return;
    }

    // otherwise use DataChannel
    // send metadata first so receiver knows expected size/name and waits for ack
    try {
      receiverReady = false;
      uiLog('Sending file-meta via DataChannel: ' + fileToSend.name + ' ' + fileToSend.size + ' B');
      dataChannel.send(JSON.stringify({ type: 'file-meta', name: fileToSend.name, size: fileToSend.size, mime: fileToSend.type }));
    } catch (e) {
      uiLog('failed to send file-meta over DataChannel: ' + (e && e.message));
      console.warn('failed to send file-meta over DataChannel', e);
    }
    // wait for receiver ack (via DataChannel) with timeout
    const dcAckTimeout = 5000; // ms
    const dcStart = Date.now();
    while (!receiverReady && Date.now() - dcStart < dcAckTimeout) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (!receiverReady) uiLog('No file-ready ack received via DataChannel; proceeding anyway');
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
      uiLog('Sent chunk via DataChannel: ' + offset + '/' + fileToSend.size);
    }

    alert('Wysłano plik (przez DataChannel)');
    uiLog('Finished sending file via DataChannel');
    sendProgress.value = 0;
  });

})();
