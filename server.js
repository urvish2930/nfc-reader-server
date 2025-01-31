const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        transports: ['websocket', 'polling']
    },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Enable CORS for all routes
const cors = require('cors');
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Basic route
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>NFC Reader Server</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .status { padding: 20px; background: #e8f5e9; border-radius: 8px; }
                    .info { margin-top: 20px; color: #666; }
                </style>
            </head>
            <body>
                <h1>NFC Reader Server</h1>
                <div class="status">Server is running!</div>
                <div class="info">
                    <p>Environment: ${process.env.PROJECT_DOMAIN ? 'Glitch' : 'Local'}</p>
                    <p>Server Time: ${new Date().toISOString()}</p>
                </div>
            </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        platform: process.env.PROJECT_DOMAIN ? 'Glitch' : 'Local',
        project: process.env.PROJECT_DOMAIN || 'local'
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    const clientInfo = {
        id: socket.id,
        timestamp: new Date().toISOString(),
        address: socket.handshake.address
    };
    
    console.log('Client connected:', clientInfo);
    
    // Send immediate acknowledgment with server timestamp
    socket.emit('connection_ack', { 
        status: 'connected', 
        id: socket.id,
        serverTime: new Date().toISOString(),
        serverInfo: {
            platform: process.env.PROJECT_DOMAIN ? 'Glitch' : 'Local',
            project: process.env.PROJECT_DOMAIN || 'local',
            version: process.env.npm_package_version || '1.0.0'
        }
    });

    // Handle NFC tag data
    socket.on('nfcData', (data) => {
        const timestamp = new Date().toISOString();
        console.log('Received NFC data:', { ...data, timestamp, clientId: socket.id });
        
        // Broadcast the NFC data to all connected clients
        io.emit('nfcDataReceived', {
            ...data,
            timestamp,
            sourceClientId: socket.id
        });
        
        // Send acknowledgment back to sender
        socket.emit('nfcDataAck', { 
            received: true, 
            timestamp,
            messageId: Math.random().toString(36).substring(7)
        });
    });

    // Handle ping from clients
    socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
            callback({
                serverTime: new Date().toISOString(),
                clientId: socket.id
            });
        }
    });

    socket.on('error', (error) => {
        console.error('Socket error for client', socket.id, ':', error);
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', { 
            id: socket.id, 
            reason, 
            timestamp: new Date().toISOString() 
        });
    });
});

// Get port from environment or use 3000
const PORT = process.env.PORT || 3000;

// Listen on all interfaces
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if (process.env.PROJECT_DOMAIN) {
        console.log(`Live URL: https://${process.env.PROJECT_DOMAIN}.glitch.me`);
    }
    console.log('Accepting connections from all origins');
});
