# P2P File Transfer

Simple Web application that enables direct file transfer between browser clients using WebRTC DataChannels and a WebSocket signaling server. Files are not stored on the server; the server only relays signaling messages.

Features
- Create a session (A) and generate a link.
- Join session (B) using the link and receive the file in real time.
- No files are written to the server disk.
- Works on mobile browsers (depends on network; no TURN used).

Notes about NAT/Networks
- This project does not use TURN. It uses a public STUN server (`stun:stun.l.google.com:19302`) to gather ICE candidates. If peers are behind symmetric NATs or strict carriers, a direct P2P connection may fail. TURN would be required in those cases, but the requirement forbids TURN.

Run locally (without Docker)

1. Install dependencies:

```powershell
cd c:\Users\w.borak\Documents\djdjd
npm install
```

2. Start server:

```powershell
npm start
```

3. Open http://localhost:8080 in browser A, click `Utwórz sesję (A)`, copy the link and open it in browser B or on mobile.

Docker

Build and run container (PowerShell):

```powershell
cd c:\Users\w.borak\Documents\djdjd
docker build -t p2p-file-transfer .
docker run -p 8080:8080 p2p-file-transfer
```

HTTPS

The server can run HTTPS if you mount certificate files and set environment variables:

```powershell
docker run -p 443:443 -e USE_HTTPS=1 -e SSL_KEY_PATH=/certs/key.pem -e SSL_CERT_PATH=/certs/cert.pem -v C:\path\to\certs:/certs p2p-file-transfer
```

Security & Privacy
- The app is minimal and intended for testing and local use. Do not expose it publicly without reviewing security.

Debugging
- Both server and client print logs. Client logs are visible in the page and sent to the server periodically for debugging.

Limitations
- No TURN servers, so connections may fail on some mobile networks.
