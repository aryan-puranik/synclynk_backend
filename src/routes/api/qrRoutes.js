// src/routes/api/qrRoutes.js
import express from 'express';
import { QRController } from '../../controllers/qrController.js';
import { SessionAuth } from '../../middleware/auth.js';
import { qrCodeLimiter } from '../../middleware/rateLimiter.js';

export const createQRRoutes = (sessionManager) => {
  const router = express.Router();
  const qrController = new QRController(sessionManager);
  const sessionAuth = new SessionAuth(sessionManager);

  // Generate QR code for session
  router.get(
    '/session/:sessionId',
    qrCodeLimiter,
    sessionAuth.validateSession,
    qrController.generateQRCode
  );

  // Get QR data as JSON
  router.get(
    '/session/:sessionId/data',
    qrCodeLimiter,
    sessionAuth.validateSession,
    qrController.getQRData
  );

  // Decode QR data
  router.post(
    '/decode',
    qrCodeLimiter,
    qrController.decodeQRData
  );

  return router;
};

export default createQRRoutes;