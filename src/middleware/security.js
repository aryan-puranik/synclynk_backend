const validateOrigin = (req, res, next) => {
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

const validateSession = (sessionManager) => {
  return (req, res, next) => {
    const sessionId = req.params.sessionId || req.body.sessionId;
    
    if (sessionId && !sessionManager.isValidSession(sessionId)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    next();
  };
};

export default {validateOrigin ,validateSession};
