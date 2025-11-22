(() => {
  const logEl = document.getElementById('log');
  function log(...args) { console.log(...args); logEl.innerText += args.join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; sendServerLog(args.join(' ')); }

  const createBtn = document.getElementById('createBtn');
  const joinBtn = document.getElementById('joinBtn');
  const sessionInput = document.getElementById('sessionInput');
  const sessionLink = document.getElementById('sessionLink');
  const fileInput = document.getElementById('fileInput');
  const sendBtn = document.getElementById('sendBtn');
  const progress = document.getElementById('progress');

  let sessionId = null;
  let ws = null;
  let pc = null;
  let dataChannel = null;
  let isInitiator = false;

  const CHUNK_SIZE = 16 * 1024;

  async function createSession() {
    const r = await fetch('/create');
    const j = await r.json();
    sessionId = j.id;
    const url = `${location.origin}${location.pathname}?session=${sessionId}`;
    sessionLink.href = url; sessionLink.innerText = url;
    sessionInput.value = url;
    log('Utworzono sesję', sessionId);
  }

  function sendServerLog(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'log', session: sessionId, msg }));
    }
  }

  function connectWS() {
    if (!sessionId) {
      const params = new URLSearchParams(location.search);
      if (params.get('session')) sessionId = params.get('session');
    }
    if (!sessionId) { log('Brak sessionId'); return; }
    ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws');
    ws.addEventListener('open', () => {
      log('WS connected');
      ws.send(JSON.stringify({ type: 'join', session: sessionId }));
      sendServerLog('client connected');
    });
    ws.addEventListener('message', async (ev) => {
      const msg = JSON.parse(ev.data);
      log('WS <-', msg.type);
      if (msg.type === 'joined') {
        // if we are the first, wait for peer. If not, act as receiver
        isInitiator = (msg.peers === 1);
        log('isInitiator=', isInitiator);
        if (isInitiator) await preparePeer(true);
      }
      if (msg.type === 'peer-joined') {
        log('peer joined — creating offer');
        if (!isInitiator) return; // only initiator creates offer
        await createOffer();
      }
      if (msg.type === 'offer') {
        await preparePeer(false);
        await pc.setRemoteDescription(msg.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', answer }));
      }
      if (msg.type === 'answer') {
        await pc.setRemoteDescription(msg.answer);
      }
      if (msg.type === 'ice') {
        try { await pc.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
      }
      if (msg.type === 'full') {
        log('Sesja pełna');
      }
    });
  }

  async function preparePeer(initiator) {
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    pc = new RTCPeerConnection(config);
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
    });

    if (initiator) {
      dataChannel = pc.createDataChannel('file');
      setupDataChannel(dataChannel);
    } else {
      pc.addEventListener('datachannel', (ev) => {
        dataChannel = ev.channel;
        setupDataChannel(dataChannel);
      });
    }

    pc.addEventListener('connectionstatechange', () => log('pc state', pc.connectionState));
  }

  function setupDataChannel(dc) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      log('DataChannel open');
      sendBtn.disabled = false;
    };
    dc.onclose = () => { log('DataChannel closed'); sendBtn.disabled = true };

    // receiver side
    let incoming = null;
    let incomingMeta = null;
    let receivedBytes = 0;
    dc.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'meta') {
            incomingMeta = m;
            incoming = [];
            receivedBytes = 0;
            progress.value = 0;
            log('meta', m.name, m.size);
          }
        } catch (e) { log('string message', ev.data); }
        return;
      }
      // binary chunk
      incoming.push(ev.data);
      receivedBytes += ev.data.byteLength || ev.data.length;
      if (incomingMeta) progress.value = Math.floor((receivedBytes / incomingMeta.size) * 100);
      if (incomingMeta && receivedBytes >= incomingMeta.size) {
        // assemble
        const blob = new Blob(incoming);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = incomingMeta.name;
        a.click();
        log('Plik odebrany:', incomingMeta.name);
        incoming = null; incomingMeta = null; receivedBytes = 0; progress.value = 100;
      }
    };
  }

  async function createOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', offer }));
  }

  async function sendFile() {
    const file = fileInput.files[0];
    if (!file) return alert('Wybierz plik');
    if (!dataChannel || dataChannel.readyState !== 'open') return alert('Kanał nieotwarty');

    const meta = { type: 'meta', name: file.name, size: file.size };
    dataChannel.send(JSON.stringify(meta));
    const stream = file.stream();
    const reader = stream.getReader();
    let sent = 0;
    progress.value = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // value is a Uint8Array
      // slice into CHUNK_SIZE
      for (let i = 0; i < value.byteLength; i += CHUNK_SIZE) {
        const chunk = value.subarray(i, i + CHUNK_SIZE);
        dataChannel.send(chunk);
        sent += chunk.byteLength;
        progress.value = Math.floor((sent / file.size) * 100);
      }
    }
    log('Wysłano plik', file.name);
  }

  createBtn.addEventListener('click', async () => {
    await createSession();
  });

  joinBtn.addEventListener('click', () => {
    const raw = sessionInput.value.trim();
    if (raw) {
      try { const u = new URL(raw); sessionId = new URL(u).searchParams.get('session') || u.pathname.split('/').pop(); }
      catch (e) { sessionId = raw; }
    } else {
      const params = new URLSearchParams(location.search);
      sessionId = params.get('session');
    }
    if (!sessionId) return alert('Brak session id');
    sessionLink.href = `${location.origin}${location.pathname}?session=${sessionId}`;
    sessionLink.innerText = sessionLink.href;
    connectWS();
  });

  sendBtn.addEventListener('click', sendFile);

  // Auto-join when session param present
  (function auto() {
    const params = new URLSearchParams(location.search);
    if (params.get('session')) {
      sessionInput.value = location.href;
      joinBtn.click();
    }
  })();

})();
