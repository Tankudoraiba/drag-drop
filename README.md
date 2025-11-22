# WebRTC P2P File Transfer

Simple web application for direct peer-to-peer file transfer between browser clients using WebRTC DataChannel.

## Features

- Direct P2P file transfer without server storage
- WebRTC DataChannel for efficient transfer
- Session-based sharing via unique links
- Real-time progress tracking
- Works on desktop and mobile devices
- No file size limits (limited only by browser memory)

## Architecture

- **Backend**: Lightweight Node.js HTTP server for WebRTC signaling
- **Frontend**: HTML5/JavaScript application
- **Communication**: WebSocket for signaling, WebRTC DataChannel for file transfer
- **Storage**: No server-side file storage (signaling messages only in memory)

## Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up --build

# Access the application
# Open http://localhost:3000 in your browser
```

## Manual Setup

```bash
# Install dependencies
npm install

# Start the server
npm start

# Access the application at http://localhost:3000
```

## How to Use

1. **Create Session**: 
   - Open the application in your browser
   - Click "Create Session" button
   - Share the generated link with the recipient

2. **Join Session**:
   - Recipient opens the shared link
   - WebRTC connection is established automatically

3. **Transfer File**:
   - Sender selects a file to transfer
   - File is sent directly to the recipient via P2P connection
   - Progress is shown in real-time
   - Recipient receives and downloads the file automatically

## Technical Details

- **Signaling**: WebSocket-based signaling for SDP exchange
- **STUN Server**: Uses Google's public STUN server for NAT traversal
- **Data Transfer**: WebRTC DataChannel with chunked transfer (16KB chunks)
- **No TURN Server**: Relies on direct P2P connection (may not work in some restrictive NAT scenarios)

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari (iOS/macOS)
- Mobile browsers with WebRTC support

## Limitations

- Both peers must be online simultaneously
- May not work in very restrictive corporate networks (no TURN server)
- Large files are limited by browser memory
- Connection requires at least one peer to be accessible via STUN

## Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (default: production)

## License

MIT
