// src/server.js
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Import services
import SessionManager from './services/SessionManager.js';
import ConnectionManager from './services/ConnectionManager.js';
import ClipboardManager from './services/ClipboardManager.js';

// Import routes
import mainRouter from './routes/index.js';
import createSessionRoutes from './routes/api/sessionRoutes.js';
import createQRRoutes from './routes/api/qrRoutes.js';
import createClipboardRoutes from './routes/api/clipboardRoutes.js';
import createStatsRoutes from './routes/api/statsRoutes.js';
import createDeviceRoutes from './routes/api/deviceRoutes.js';
import setupWebSocketRoutes from './routes/websocketRoutes.js';


// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { validateOrigin } from './middleware/validation.js';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize managers
const sessionManager = new SessionManager();
const connectionManager = new ConnectionManager(sessionManager);
const clipboardManager = new ClipboardManager(sessionManager);

// Set up clipboard manager socket access
clipboardManager.setSocketAccessor((socketId) => {
  return connectionManager.getSocketById(socketId);
});

// Security middleware
app.use(helmet());
app.use(validateOrigin);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create route instances with dependencies
const sessionRoutes = createSessionRoutes(sessionManager, connectionManager);
const qrRoutes = createQRRoutes(sessionManager);
const clipboardRoutes = createClipboardRoutes(clipboardManager, sessionManager);
const statsRoutes = createStatsRoutes(sessionManager, connectionManager, clipboardManager);
const deviceRoutes = createDeviceRoutes(sessionManager);

// Mount API routes
const apiRouter = express.Router();
apiRouter.use('/v1/sessions', sessionRoutes);
apiRouter.use('/v1/qr', qrRoutes);
apiRouter.use('/v1/clipboard', clipboardRoutes);
apiRouter.use('/v1/stats', statsRoutes);
apiRouter.use('/v1/devices', deviceRoutes);

// Mount main router
app.use(mainRouter);
app.use('/api', apiRouter);

// Setup WebSocket routes
const io = setupWebSocketRoutes(server, sessionManager, connectionManager);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  
  // Close all sessions
  sessionManager.destroy();
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Universal Clipboard Server running on port ${PORT}`);
  console.log(`📱 API: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
});

// Export for testing
export {
  app,
  server,
  io,
  sessionManager,
  connectionManager,
  clipboardManager
};