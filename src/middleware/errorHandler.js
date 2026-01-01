const errorHandler = (err, req, res, next) => {
  console.error('Server error:', err);
  
  // Default error
  let statusCode = 500;
  let message = 'Internal Server Error';
  
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
  }
  
  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
    path: req.path
  });
};

module.exports = {
  errorHandler
};