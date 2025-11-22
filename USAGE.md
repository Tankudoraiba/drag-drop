# WebRTC P2P File Transfer - Usage Guide

## Quick Start

### Option 1: Docker Compose (Recommended)

The easiest way to run the application:

```bash
docker-compose up --build
```

Then open your browser to: `http://localhost:3000`

### Option 2: Docker

Build and run using Docker directly:

```bash
# Build the image
docker build -t webrtc-p2p-file-transfer .

# Run the container
docker run -p 3000:3000 webrtc-p2p-file-transfer
```

### Option 3: Node.js

Run directly with Node.js (requires Node.js 18+):

```bash
# Install dependencies
npm install

# Start the server
npm start
```

## How to Transfer Files

### Step 1: Create a Session

1. Open the application in your browser
2. Click the "📤 Create Session" button
3. A unique session link will be generated

### Step 2: Share the Link

1. Copy the session link using the "📋 Copy" button
2. Send this link to the recipient via email, chat, etc.

### Step 3: Recipient Joins

1. Recipient opens the shared link in their browser
2. WebRTC connection is established automatically
3. Both users see "Connected" status

### Step 4: Send File

1. Sender clicks "Choose File" and selects a file
2. Click "📤 Send File" button
3. File is transferred directly P2P (not through server)
4. Real-time progress is shown to both users

### Step 5: Receive File

1. Recipient sees download progress
2. When complete, click "💾 Download File" button
3. File is saved to the recipient's device

## Important Notes

### Requirements
- Both users must be online simultaneously
- Modern web browser with WebRTC support (Chrome, Firefox, Safari, Edge)
- Internet connection (for NAT traversal via STUN)

### Limitations
- No server-side file storage (P2P only)
- May not work in very restrictive corporate networks
- Large files are limited by browser memory
- Connection timeout: 1 hour of inactivity

### Security
- Session IDs are cryptographically secure (128-bit entropy)
- No files stored on server
- Direct P2P transfer using WebRTC encryption
- Sessions automatically cleaned up after 1 hour

### Browser Compatibility
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (macOS/iOS)
- ✅ Mobile browsers with WebRTC support

## Troubleshooting

### "Connection not ready" error
- Wait for the recipient to join the session
- Check that both browsers support WebRTC
- Verify internet connectivity

### File transfer stuck at 0%
- Refresh both browsers and try again
- Check firewall settings
- Some corporate networks block P2P connections

### Session not found
- Session link may have expired (1 hour timeout)
- Create a new session and share the new link
- Ensure the full link was copied correctly

## Architecture

### Components
- **Frontend**: HTML5 + JavaScript + CSS3
- **Backend**: Node.js + Express + WebSocket
- **WebRTC**: DataChannel for P2P transfer
- **STUN**: Google's public STUN servers

### Data Flow
1. User creates session → Server generates unique ID
2. Recipient joins → WebSocket signaling begins
3. WebRTC connection established → Peers connected
4. File transfer → Direct P2P via DataChannel
5. No server storage → Files never touch the server

## Environment Variables

You can customize the server using environment variables:

```bash
# Port number (default: 3000)
PORT=8080

# Node environment (default: production)
NODE_ENV=development
```

Example with Docker:
```bash
docker run -p 8080:8080 -e PORT=8080 webrtc-p2p-file-transfer
```

## Support

For issues or questions, please refer to:
- README.md for project overview
- GitHub Issues for bug reports
- Source code documentation for technical details
