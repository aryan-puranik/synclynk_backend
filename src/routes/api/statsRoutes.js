// src/routes/api/statsRoutes.js
import express from 'express';
import StatsController  from '../../controllers/statsController.js';
import { validatePagination } from '../../middleware/validation.js';

export const createStatsRoutes = (sessionManager, connectionManager, clipboardManager) => {
  const router = express.Router();
  const statsController = new StatsController(sessionManager, connectionManager, clipboardManager);

  // System health
  router.get(
    '/health',
    statsController.getHealth
  );

  // Detailed statistics
  router.get(
    '/',
    validatePagination,
    statsController.getStatistics
  );

  // Real-time metrics
  router.get(
    '/metrics',
    statsController.getMetrics
  );

  // Clipboard statistics
  router.get(
    '/clipboard',
    statsController.getClipboardStats
  );

  // Session statistics
  router.get(
    '/sessions',
    statsController.getSessionStats
  );

  return router;
};

export default createStatsRoutes;