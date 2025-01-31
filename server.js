const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected clients
const connectedClients = new Set();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  connectedClients.add(socket.id);

  // Handle NFC tag data from mobile
  socket.on('nfcData', (data) => {
    console.log('NFC data received:', data);
    // Broadcast to all other connected clients (computers)
    socket.broadcast.emit('nfcDataReceived', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    connectedClients.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
