// src/routes/index.js
import express from 'express';
import apiRoutes from './api/index.js';
import websocketRoutes from './websocketRoutes.js';

const router = express.Router();

// API Routes
router.use('/api', apiRoutes);

// WebSocket routes will be handled separately
// This is just for API documentation
router.get('/ws-info', (req, res) => {
  res.json({
    websocket: {
      endpoint: '/socket.io',
      transports: ['websocket', 'polling'],
      version: '4.x'
    }
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Universal Clipboard API',
    version: '1.0.0'
  });
});

// API Documentation
router.get('/', (req, res) => {
  res.json({
    service: 'Universal Clipboard Backend API',
    version: '1.0.0',
    endpoints: {
      api: '/api/v1',
      websocket: '/socket.io',
      health: '/health',
      documentation: 'Coming soon...'
    }
  });
});

export default router;