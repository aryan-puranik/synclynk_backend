// src/routes/api/index.js
import express from 'express';
import sessionRoutes from './sessionRoutes.js';
import qrRoutes from './qrRoutes.js';
import clipboardRoutes from './clipboardRoutes.js';
import statsRoutes from './statsRoutes.js';
import deviceRoutes from './deviceRoutes.js';
import { apiLimiter } from '../../middleware/rateLimiter.js';


const router = express.Router();

// Apply rate limiting to all API routes
router.use(apiLimiter);

// API Version
router.use((req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Mount routes
router.use('/sessions', sessionRoutes);
router.use('/qr', qrRoutes);
router.use('/clipboard', clipboardRoutes);
router.use('/stats', statsRoutes);
router.use('/devices', deviceRoutes);

// API Info endpoint
router.get('/', (req, res) => {
  res.json({
    api: 'Universal Clipboard API',
    version: '1.0.0',
    endpoints: {
      sessions: '/api/v1/sessions',
      qr: '/api/v1/qr',
      clipboard: '/api/v1/clipboard',
      stats: '/api/v1/stats',
      devices: '/api/v1/devices'
    },
    documentation: 'https://docs.synclynk.com/api/v1'
  });
});

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: ['/sessions', '/qr', '/clipboard', '/stats', '/devices']
  });
});

export default router;