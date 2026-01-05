// src/routes/api/clipboardRoutes.js
import express from 'express';
import ClipboardController  from '../../controllers/clipboardController.js';
import { SessionAuth } from '../../middleware/auth.js';
import {
  validateClipboardData,
  validatePagination
} from '../../middleware/validation.js';
import { clipboardLimiter } from '../../middleware/rateLimiter.js';

export const createClipboardRoutes = (clipboardManager, sessionManager) => {
  const router = express.Router();
  const clipboardController = new ClipboardController(clipboardManager, sessionManager);
  const sessionAuth = new SessionAuth(sessionManager);

  // Send clipboard data
  router.post(
    '/session/:sessionId/send',
    clipboardLimiter,
    sessionAuth.validateSession,
    validateClipboardData,
    clipboardController.sendClipboardData
  );

  // Get clipboard history
  router.get(
    '/session/:sessionId/history',
    sessionAuth.validateSession,
    validatePagination,
    clipboardController.getClipboardHistory
  );

  // Get specific clipboard item
  router.get(
    '/session/:sessionId/history/:itemId',
    sessionAuth.validateSession,
    clipboardController.getClipboardItem
  );

  // Get queued messages for device
  router.get(
    '/queued/:deviceId',
    clipboardController.getQueuedMessages
  );

  // Clear queued messages
  router.delete(
    '/queued/:deviceId',
    clipboardController.clearQueuedMessages
  );

  return router;
};

export default createClipboardRoutes;