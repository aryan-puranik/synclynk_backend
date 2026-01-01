// src/routes/api/sessionRoutes.js
import express from 'express';
import { SessionController } from '../../controllers/sessionController.js';
import { SessionAuth } from '../../middleware/auth.js';
import {
  validateCreateSession,
  validateJoinSession,
  validatePagination
} from '../../middleware/validation.js';
import {
  sessionCreationLimiter
} from '../../middleware/rateLimiter.js';

export const createSessionRoutes = (sessionManager, connectionManager) => {
  const router = express.Router();
  const sessionController = new SessionController(sessionManager, connectionManager);
  const sessionAuth = new SessionAuth(sessionManager);

  // Create new session
  router.post(
    '/',
    sessionCreationLimiter,
    validateCreateSession,
    sessionController.createSession
  );

  // Get session info
  router.get(
    '/:sessionId',
    sessionAuth.validateSession,
    sessionController.getSession
  );

  // Join session
  router.post(
    '/:sessionId/join',
    sessionAuth.validateSession,
    validateJoinSession,
    sessionController.joinSession
  );

  // Leave session
  router.delete(
    '/:sessionId/devices/:deviceId',
    sessionAuth.validateDevice,
    sessionController.leaveSession
  );

  // Extend session
  router.patch(
    '/:sessionId/extend',
    sessionAuth.validateSession,
    sessionController.extendSession
  );

  // List all sessions (admin)
  router.get(
    '/',
    validatePagination,
    sessionController.listSessions
  );

  // Get session devices
  router.get(
    '/:sessionId/devices',
    sessionAuth.validateSession,
    sessionController.listDevices
  );

  return router;
};

export default createSessionRoutes;