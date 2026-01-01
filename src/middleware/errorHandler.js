// src/middleware/errorHandler.js
import { ApiResponse } from '../utils/response.js';

export const errorHandler = (err, req, res, next) => {
  console.error('Server error:', err);
  
  // Default error
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors = null;
  
  // Custom error types
  if (err.message.includes('Session not found')) {
    statusCode = 404;
    message = err.message;
  } else if (err.message.includes('device limit')) {
    statusCode = 400;
    message = err.message;
  } else if (err.message.includes('rate limit')) {
    statusCode = 429;
    message = 'Too many requests';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.errors;
  }
  
  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error stack:', err.stack);
  }
  
  res.status(statusCode).json(
    ApiResponse.error(message, errors)
  );
};

export default errorHandler;