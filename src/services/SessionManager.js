const { v4: uuidv4 } = require('uuid');

class Session {
  constructor(id, maxDevices = 5) {
    this.id = id;
    this.devices = new Map(); // socketId -> deviceInfo
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.expiresAt = Date.now() + (30 * 60 * 1000); // 30 minutes
    this.maxDevices = maxDevices;
    this.clipboardHistory = []; // In-memory only, cleared on expiration
  }
  
  addDevice(socketId, deviceInfo) {
    if (this.devices.size >= this.maxDevices) {
      throw new Error('Session device limit reached');
    }
    
    this.devices.set(socketId, {
      ...deviceInfo,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });
    
    this.updateActivity();
  }
  
  removeDevice(socketId) {
    this.devices.delete(socketId);
    this.updateActivity();
  }
  
  getDevice(socketId) {
    return this.devices.get(socketId);
  }
  
  updateActivity() {
    this.lastActivity = Date.now();
    this.expiresAt = this.lastActivity + (30 * 60 * 1000);
  }
  
  isExpired() {
    return Date.now() > this.expiresAt;
  }
  
  canAcceptDevice() {
    return this.devices.size < this.maxDevices && !this.isExpired();
  }
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // 5 minutes
  }
  
  createSession(maxDevices = 5) {
    const sessionId = uuidv4();
    const session = new Session(sessionId, maxDevices);
    this.sessions.set(sessionId, session);
    
    console.log(`Created new session: ${sessionId}`);
    return session;
  }
  
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && !session.isExpired()) {
      session.updateActivity();
      return session;
    }
    
    if (session && session.isExpired()) {
      this.destroySession(sessionId);
    }
    
    return null;
  }
  
  isValidSession(sessionId) {
    const session = this.getSession(sessionId);
    return !!session;
  }
  
  joinSession(sessionId, socketId, deviceInfo) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found or expired');
    }
    
    if (!session.canAcceptDevice()) {
      throw new Error('Session cannot accept more devices or has expired');
    }
    
    session.addDevice(socketId, deviceInfo);
    return session;
  }
  
  leaveSession(socketId) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.devices.has(socketId)) {
        session.removeDevice(socketId);
        
        // If session is empty, destroy it
        if (session.devices.size === 0) {
          this.destroySession(sessionId);
        }
        
        return sessionId;
      }
    }
    
    return null;
  }
  
  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clear all devices and data
      session.devices.clear();
      session.clipboardHistory = [];
      this.sessions.delete(sessionId);
      console.log(`Destroyed session: ${sessionId}`);
    }
  }
  
  getSessionBySocket(socketId) {
    for (const session of this.sessions.values()) {
      if (session.devices.has(socketId)) {
        return session;
      }
    }
    return null;
  }
  
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isExpired()) {
        this.destroySession(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }
  
  getActiveSessionCount() {
    return this.sessions.size;
  }
  
  // Graceful shutdown
  destroy() {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

export default SessionManager;