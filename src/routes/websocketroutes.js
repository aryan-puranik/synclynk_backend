// src/routes/websocketRoutes.js
import { Server } from 'socket.io';

export const setupWebSocketRoutes = (server, sessionManager, connectionManager) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:5173',
        'http://localhost:3000'
      ],
      methods: ["GET", "POST"],
      credentials: true
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true
    }
  });

  // WebSocket connection handling
  io.on('connection', (socket) => {
    console.log(`New WebSocket connection: ${socket.id}`);
    
    connectionManager.handleConnection(socket);
    
    socket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${socket.id} - ${reason}`);
      connectionManager.handleDisconnection(socket.id);
    });
    
    socket.on('error', (error) => {
      console.error(`WebSocket error for ${socket.id}:`, error);
      connectionManager.handleError(socket.id, error);
    });
  });

  return io;
};

export default setupWebSocketRoutes;