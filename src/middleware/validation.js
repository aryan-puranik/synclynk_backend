// src/middleware/validation.js
import { Validators } from '../utils/validators.js';
import { ApiResponse } from '../utils/response.js';

export const validateCreateSession = (req, res, next) => {
  const { deviceInfo } = req.body;
  
  const validation = Validators.validateDeviceInfo(deviceInfo);
  if (!validation.valid) {
    return res.status(400).json(
      ApiResponse.error(validation.error)
    );
  }
  
  next();
};

export const validateJoinSession = (req, res, next) => {
  const { sessionId } = req.params;
  const { deviceInfo } = req.body;
  
  // Validate session ID
  const sessionValidation = Validators.validateSessionId(sessionId);
  if (!sessionValidation.valid) {
    return res.status(400).json(
      ApiResponse.error(sessionValidation.error)
    );
  }
  
  // Validate device info
  const deviceValidation = Validators.validateDeviceInfo(deviceInfo);
  if (!deviceValidation.valid) {
    return res.status(400).json(
      ApiResponse.error(deviceValidation.error)
    );
  }
  
  next();
};

export const validateClipboardData = (req, res, next) => {
  const data = req.body;
  
  const validation = Validators.validateClipboardData(data);
  if (!validation.valid) {
    return res.status(400).json(
      ApiResponse.error(validation.error)
    );
  }
  
  next();
};

export const validatePagination = (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  
  const validation = Validators.validatePagination(page, limit);
  if (!validation.valid) {
    return res.status(400).json(
      ApiResponse.error(validation.error)
    );
  }
  
  req.pagination = {
    page: validation.page,
    limit: validation.limit,
    skip: (validation.page - 1) * validation.limit
  };
  
  next();
};

export const validateOrigin = (req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000', 
    'http://localhost:3001',
    'https://yourdomain.com'
  ];
  
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
};

