// src/middleware/auth.js
import { ApiResponse } from '../utils/response.js';

export class SessionAuth {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  // Validate session exists and is active
  validateSession = (req, res, next) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json(
        ApiResponse.error('Session ID is required')
      );
    }
    
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json(
        ApiResponse.error('Session not found or expired')
      );
    }
    
    req.session = session;
    next();
  };

  // Validate device is part of session
  validateDevice = (req, res, next) => {
    const { sessionId, deviceId } = req.params;
    const session = this.sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json(
        ApiResponse.error('Session not found')
      );
    }
    
    const device = session.getDevice(deviceId);
    if (!device) {
      return res.status(403).json(
        ApiResponse.error('Device not found in session')
      );
    }
    
    req.device = device;
    req.session = session;
    next();
  };
}

// Simple API key authentication (optional for admin endpoints)
export const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json(
      ApiResponse.error('Invalid or missing API key')
    );
  }
  
  next();
};