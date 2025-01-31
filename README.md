# NFC Reader Server

A WebSocket server for the NFC Reader mobile app that works across different networks.

## Deployment Instructions

1. Create a free account on [Render.com](https://render.com)

2. Create a new Web Service:
   - Connect your GitHub repository
   - Select the branch to deploy
   - Use the following settings:
     - Name: nfc-reader-server
     - Environment: Node
     - Build Command: `npm install`
     - Start Command: `node server.js`
     - Plan: Free

3. Set Environment Variables:
   - NODE_ENV: production
   - PORT: 3000

4. After deployment, Render will provide a URL like: `https://nfc-reader-server.onrender.com`

5. Update the `SERVER_CONFIG.production` URL in your React Native app (App.tsx) with your Render URL

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   node server.js
   ```

The server will run on `http://localhost:3000` in development mode.

## Features

- WebSocket and HTTP long-polling support
- Automatic reconnection
- Cross-network compatibility
- Secure communication
- Connection monitoring
- Latency tracking
- Error handling and logging
