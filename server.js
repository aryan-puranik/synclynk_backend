require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import custom modules
const SessionManager = require('./src/services/SessionManager');
const ConnectionManager = require('./src/services/ConnectionManager');
const { validateOrigin } = require('./src/middleware/security');
const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(validateOrigin);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

app.use(express.json());
app.use(errorHandler);

// Initialize managers
const sessionManager = new SessionManager();
const connectionManager = new ConnectionManager(sessionManager);

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    methods: ["GET", "POST"]
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  connectionManager.handleConnection(socket);
  
  socket.on('disconnect', (reason) => {
    console.log(`Disconnected: ${socket.id} - ${reason}`);
    connectionManager.handleDisconnection(socket.id);
  });
  
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
    connectionManager.handleError(socket.id, error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: sessionManager.getActiveSessionCount(),
    activeConnections: connectionManager.getActiveConnectionCount()
  });
});

// QR code generation endpoint
app.get('/api/qr-code/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionManager.isValidSession(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const qrData = {
    sessionId,
    serverUrl: process.env.SERVER_URL || `http://localhost:${PORT}`,
    timestamp: Date.now()
  };
  
  res.json({ 
    qrData: Buffer.from(JSON.stringify(qrData)).toString('base64'),
    sessionId 
  });
});

// Session info endpoint
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Return minimal session info for security
  res.json({
    sessionId: session.id,
    deviceCount: session.devices.size,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Universal Clipboard Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
});

module.exports = { app, server, sessionManager, connectionManager };