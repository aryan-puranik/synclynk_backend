// src/routes/api/deviceRoutes.js
import express from 'express';
import { DeviceController } from '../../controllers/deviceController.js';
import { SessionAuth } from '../../middleware/auth.js';

export const createDeviceRoutes = (sessionManager) => {
  const router = express.Router();
  const deviceController = new DeviceController(sessionManager);
  const sessionAuth = new SessionAuth(sessionManager);

  // Get device info
  router.get(
    '/session/:sessionId/device/:deviceId',
    sessionAuth.validateDevice,
    deviceController.getDevice
  );

  // Update device info
  router.patch(
    '/session/:sessionId/device/:deviceId',
    sessionAuth.validateDevice,
    deviceController.updateDevice
  );

  // List devices in session
  router.get(
    '/session/:sessionId',
    sessionAuth.validateSession,
    deviceController.listDevices
  );

  return router;
};

export default createDeviceRoutes;