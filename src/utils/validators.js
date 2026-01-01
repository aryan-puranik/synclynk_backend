// src/utils/validators.js
export class Validators {
  static validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      return { valid: false, error: 'Session ID is required and must be a string' };
    }
    
    // UUID v4 pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    // Allow both UUID and custom session IDs (min 8 chars)
    if (sessionId.length < 8) {
      return { valid: false, error: 'Session ID must be at least 8 characters' };
    }
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\-_]+$/.test(sessionId)) {
      return { valid: false, error: 'Session ID contains invalid characters' };
    }
    
    return { valid: true };
  }

  static validateDeviceInfo(deviceInfo) {
    if (!deviceInfo || typeof deviceInfo !== 'object') {
      return { valid: false, error: 'Device info must be an object' };
    }
    
    const requiredFields = ['type', 'name'];
    for (const field of requiredFields) {
      if (!deviceInfo[field] || typeof deviceInfo[field] !== 'string') {
        return { valid: false, error: `${field} is required and must be a string` };
      }
    }
    
    // Validate device type
    const allowedTypes = ['web', 'android', 'ios', 'desktop', 'mobile'];
    if (!allowedTypes.includes(deviceInfo.type.toLowerCase())) {
      return { valid: false, error: `Invalid device type. Allowed: ${allowedTypes.join(', ')}` };
    }
    
    // Validate name length
    if (deviceInfo.name.length > 100) {
      return { valid: false, error: 'Device name too long (max 100 characters)' };
    }
    
    return { valid: true };
  }

  static validateClipboardData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Clipboard data must be an object' };
    }
    
    const allowedTypes = ['text', 'url', 'image', 'file'];
    
    if (!data.type || !allowedTypes.includes(data.type)) {
      return { valid: false, error: `Invalid type. Allowed: ${allowedTypes.join(', ')}` };
    }
    
    if (!data.content && data.type !== 'file') {
      return { valid: false, error: 'Content is required for this type' };
    }
    
    // Content validation based on type
    switch (data.type) {
      case 'text':
        if (typeof data.content !== 'string') {
          return { valid: false, error: 'Text content must be a string' };
        }
        if (data.content.length > 100000) {
          return { valid: false, error: 'Text too long (max 100KB)' };
        }
        break;
        
      case 'url':
        if (typeof data.content !== 'string') {
          return { valid: false, error: 'URL must be a string' };
        }
        try {
          new URL(data.content);
        } catch {
          return { valid: false, error: 'Invalid URL format' };
        }
        break;
        
      case 'image':
        if (typeof data.content !== 'string') {
          return { valid: false, error: 'Image data must be a string' };
        }
        if (!data.content.startsWith('data:image/')) {
          return { valid: false, error: 'Invalid image data format' };
        }
        break;
        
      case 'file':
        if (data.content && typeof data.content !== 'string') {
          return { valid: false, error: 'File data must be a string' };
        }
        if (!data.metadata?.filename) {
          return { valid: false, error: 'Filename required in metadata' };
        }
        break;
    }
    
    return { valid: true };
  }

  static validatePagination(page = 1, limit = 10) {
    page = parseInt(page);
    limit = parseInt(limit);
    
    if (isNaN(page) || page < 1) {
      return { valid: false, error: 'Page must be a positive number' };
    }
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return { valid: false, error: 'Limit must be between 1 and 100' };
    }
    
    return { valid: true, page, limit };
  }
}