// src/controllers/sessionController.js
import { ApiResponse, HttpError } from '../utils/response.js';
import { v4 as uuidv4 } from 'uuid';

export class SessionController {
  constructor(sessionManager, connectionManager) {
    this.sessionManager = sessionManager;
    this.connectionManager = connectionManager;
  }

  // Create a new session
  createSession = async (req, res, next) => {
    try {
      const { deviceInfo, maxDevices = 5 } = req.body;
      
      // Validate max devices
      if (maxDevices < 2 || maxDevices > 10) {
        throw new HttpError('maxDevices must be between 2 and 10', 400);
      }
      
      // Generate a unique device ID for the creator
      const creatorDeviceId = `device_${uuidv4()}`;
      
      // Create session
      const session = this.sessionManager.createSession(parseInt(maxDevices));
      
      // Add creator device to session (simulated - actual join happens via WebSocket)
      const enhancedDeviceInfo = {
        ...deviceInfo,
        id: creatorDeviceId,
        isCreator: true,
        joinedAt: Date.now()
      };
      
      // Simulate device joining (in real app, this happens via WebSocket)
      // session.addDevice(creatorDeviceId, enhancedDeviceInfo);
      
      // Prepare response data
      const responseData = {
        session: {
          id: session.id,
          maxDevices: session.maxDevices,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          deviceCount: 1 // Starts with creator
        },
        device: {
          id: creatorDeviceId,
          isCreator: true,
          token: this.generateDeviceToken(creatorDeviceId, session.id)
        },
        urls: {
          session: `/api/v1/sessions/${session.id}`,
          join: `/api/v1/sessions/${session.id}/join`,
          qrCode: `/api/v1/qr/session/${session.id}`,
          qrData: `/api/v1/qr/session/${session.id}/data`,
          websocket: process.env.SERVER_URL || 'http://localhost:3000'
        },
        instructions: {
          webSocketConnection: 'Connect via WebSocket with the device token',
          shareSession: 'Share the QR code or session ID with other devices',
          maxDevices: `This session can have up to ${maxDevices} devices`
        }
      };
      
      console.log(`Session created: ${session.id} by device ${creatorDeviceId}`);
      
      res.status(201).json(
        ApiResponse.success(responseData, 'Session created successfully')
      );
    } catch (error) {
      next(error);
    }
  };

  // Get session information
  getSession = async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const session = req.session; // From auth middleware
      
      // Get devices in session (without sensitive info)
      const devices = Array.from(session.devices.entries()).map(([id, info]) => ({
        id,
        type: info.type,
        name: info.name,
        platform: info.platform,
        os: info.os,
        browser: info.browser,
        joinedAt: info.joinedAt,
        lastSeen: info.lastSeen,
        isOnline: this.connectionManager.isDeviceOnline(id)
      }));
      
      // Calculate session stats
      const now = Date.now();
      const timeRemaining = Math.max(0, session.expiresAt - now);
      const isActive = !session.isExpired();
      
      const sessionData = {
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        timeRemaining: Math.floor(timeRemaining / 1000), // seconds
        isActive,
        isExpired: session.isExpired(),
        deviceCount: session.devices.size,
        maxDevices: session.maxDevices,
        lastActivity: session.lastActivity,
        devices,
        clipboardHistoryCount: session.clipboardHistory.length,
        urls: {
          devices: `/api/v1/sessions/${sessionId}/devices`,
          clipboardHistory: `/api/v1/clipboard/session/${sessionId}/history`,
          qrCode: `/api/v1/qr/session/${sessionId}`,
          extend: `/api/v1/sessions/${sessionId}/extend`
        }
      };
      
      res.json(
        ApiResponse.success(sessionData, 'Session information retrieved')
      );
    } catch (error) {
      next(error);
    }
  };

  // Join an existing session (REST API version - prepares for WebSocket join)
  joinSession = async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { deviceInfo } = req.body;
      const session = req.session;
      
      // Check if session can accept more devices
      if (!session.canAcceptDevice()) {
        throw new HttpError('Session is full or has expired', 400);
      }
      
      // Generate device ID for joiner
      const deviceId = `device_${uuidv4()}`;
      
      // Prepare device info with additional metadata
      const enhancedDeviceInfo = {
        ...deviceInfo,
        id: deviceId,
        isCreator: false,
        joinedAt: Date.now(),
        lastSeen: Date.now()
      };
      
      // Generate authentication token for WebSocket connection
      const deviceToken = this.generateDeviceToken(deviceId, sessionId);
      
      // Prepare WebSocket connection information
      const connectionInfo = {
        serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
        websocketPath: '/socket.io/',
        sessionId,
        deviceId,
        deviceToken,
        events: {
          connect: 'connect',
          join: 'join_session',
          clipboard: 'clipboard_data',
          disconnect: 'disconnect'
        }
      };
      
      const responseData = {
        session: {
          id: session.id,
          deviceCount: session.devices.size + 1, // Including this new device
          maxDevices: session.maxDevices,
          expiresAt: session.expiresAt
        },
        device: {
          id: deviceId,
          token: deviceToken,
          isCreator: false
        },
        connection: connectionInfo,
        instructions: {
          webSocket: `Connect to ${connectionInfo.serverUrl}${connectionInfo.websocketPath}`,
          authentication: `Send device token: ${deviceToken}`,
          joinEvent: `Emit 'join_session' event with sessionId and deviceInfo`
        }
      };
      
      console.log(`Device ${deviceId} prepared to join session ${sessionId}`);
      
      res.json(
        ApiResponse.success(responseData, 'Ready to join session via WebSocket')
      );
    } catch (error) {
      next(error);
    }
  };

  // Leave a session
  leaveSession = async (req, res, next) => {
    try {
      const { sessionId, deviceId } = req.params;
      const session = req.session;
      const device = req.device;
      
      // Remove device from session
      this.sessionManager.leaveSession(deviceId);
      
      // Notify other devices via WebSocket (if they're connected)
      this.notifyDeviceLeft(sessionId, deviceId, device);
      
      const responseData = {
        sessionId,
        deviceId,
        action: 'left',
        timestamp: Date.now(),
        remainingDevices: session.devices.size
      };
      
      console.log(`Device ${deviceId} left session ${sessionId}`);
      
      res.json(
        ApiResponse.success(responseData, 'Successfully left session')
      );
    } catch (error) {
      next(error);
    }
  };

  // List all active sessions (admin/management endpoint)
  listSessions = async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.pagination;
      const allSessions = Array.from(this.sessionManager.sessions.values());
      
      // Filter out expired sessions
      const activeSessions = allSessions.filter(session => !session.isExpired());
      
      // Sort by last activity (newest first)
      activeSessions.sort((a, b) => b.lastActivity - a.lastActivity);
      
      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedSessions = activeSessions.slice(startIndex, endIndex);
      
      // Format session data
      const sessionsData = paginatedSessions.map(session => {
        const now = Date.now();
        const timeRemaining = Math.max(0, session.expiresAt - now);
        
        return {
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          timeRemaining: Math.floor(timeRemaining / 1000),
          deviceCount: session.devices.size,
          maxDevices: session.maxDevices,
          lastActivity: session.lastActivity,
          clipboardItems: session.clipboardHistory.length,
          urls: {
            self: `/api/v1/sessions/${session.id}`,
            devices: `/api/v1/sessions/${session.id}/devices`
          }
        };
      });
      
      const responseData = {
        sessions: sessionsData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: activeSessions.length,
          pages: Math.ceil(activeSessions.length / limit),
          hasMore: endIndex < activeSessions.length
        },
        stats: {
          totalSessions: allSessions.length,
          activeSessions: activeSessions.length,
          expiredSessions: allSessions.length - activeSessions.length,
          totalDevices: activeSessions.reduce((sum, session) => sum + session.devices.size, 0)
        }
      };
      
      res.json(
        ApiResponse.success(responseData, 'Active sessions retrieved')
      );
    } catch (error) {
      next(error);
    }
  };

  // Extend session lifetime
  extendSession = async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const session = req.session;
      
      // Update session activity to extend expiry
      session.updateActivity();
      
      const responseData = {
        sessionId,
        oldExpiresAt: req.body.originalExpiry || session.expiresAt - (30 * 60 * 1000),
        newExpiresAt: session.expiresAt,
        extendedBy: 30 * 60 * 1000, // 30 minutes
        timeRemaining: Math.floor((session.expiresAt - Date.now()) / 1000)
      };
      
      console.log(`Session ${sessionId} extended until ${new Date(session.expiresAt).toISOString()}`);
      
      res.json(
        ApiResponse.success(responseData, 'Session extended successfully')
      );
    } catch (error) {
      next(error);
    }
  };

  // List devices in a session
  listDevices = async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const session = req.session;
      
      const devices = Array.from(session.devices.entries()).map(([id, info]) => ({
        id,
        type: info.type,
        name: info.name,
        platform: info.platform,
        os: info.os,
        browser: info.browser,
        joinedAt: info.joinedAt,
        lastSeen: info.lastSeen,
        isOnline: this.connectionManager.isDeviceOnline(id),
        isCreator: info.isCreator || false,
        connectionInfo: {
          deviceId: id,
          sessionId,
          lastHeartbeat: info.lastHeartbeat || null
        }
      }));
      
      // Sort devices: online first, then by join time
      devices.sort((a, b) => {
        if (a.isOnline !== b.isOnline) {
          return a.isOnline ? -1 : 1;
        }
        return b.joinedAt - a.joinedAt;
      });
      
      const responseData = {
        sessionId,
        count: devices.length,
        onlineCount: devices.filter(d => d.isOnline).length,
        offlineCount: devices.filter(d => !d.isOnline).length,
        devices,
        stats: {
          totalDevices: devices.length,
          onlineDevices: devices.filter(d => d.isOnline).length,
          averageUptime: this.calculateAverageDeviceUptime(devices)
        }
      };
      
      res.json(
        ApiResponse.success(responseData, 'Devices in session retrieved')
      );
    } catch (error) {
      next(error);
    }
  };

  // ========== HELPER METHODS ==========
  
  // Generate a simple device token (in production, use JWT or similar)
  generateDeviceToken(deviceId, sessionId) {
    const payload = {
      deviceId,
      sessionId,
      timestamp: Date.now(),
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
    
    // Simple base64 encoding (in production, use proper signing)
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  
  // Notify other devices when a device leaves
  notifyDeviceLeft(sessionId, deviceId, deviceInfo) {
    try {
      // Get WebSocket instance (injected via connectionManager)
      const io = this.connectionManager.getIO();
      if (io) {
        io.to(sessionId).emit('device_left', {
          deviceId,
          deviceInfo: {
            name: deviceInfo.name,
            type: deviceInfo.type
          },
          timestamp: Date.now(),
          reason: 'left_via_api'
        });
      }
    } catch (error) {
      console.error('Error notifying devices:', error);
    }
  }
  
  // Calculate average device uptime
  calculateAverageDeviceUptime(devices) {
    if (devices.length === 0) return 0;
    
    const now = Date.now();
    const totalUptime = devices.reduce((sum, device) => {
      const joinedTime = device.joinedAt || now;
      return sum + (now - joinedTime);
    }, 0);
    
    return Math.floor(totalUptime / devices.length / 1000); // in seconds
  }
  
  // Validate device token (for WebSocket authentication)
  validateDeviceToken(token) {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Check expiration
      if (Date.now() > payload.expires) {
        return { valid: false, error: 'Token expired' };
      }
      
      // Check required fields
      if (!payload.deviceId || !payload.sessionId) {
        return { valid: false, error: 'Invalid token format' };
      }
      
      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }
}

export default SessionController;