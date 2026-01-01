class ConnectionManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.connections = new Map(); // socketId -> connectionInfo
  }
  
  handleConnection(socket) {
    const connectionInfo = {
      socketId: socket.id,
      connectedAt: Date.now(),
      sessionId: null,
      deviceType: null,
      lastActivity: Date.now()
    };
    
    this.connections.set(socket.id, connectionInfo);
    
    // Setup message handlers
    this.setupMessageHandlers(socket);
  }
  
  setupMessageHandlers(socket) {
    // Create new session
    socket.on('create_session', (data, callback) => {
      this.handleCreateSession(socket, data, callback);
    });
    
    // Join existing session
    socket.on('join_session', (data, callback) => {
      this.handleJoinSession(socket, data, callback);
    });
    
    // Clipboard data
    socket.on('clipboard_data', (data) => {
      this.handleClipboardData(socket, data);
    });
    
    // Heartbeat
    socket.on('heartbeat', () => {
      this.handleHeartbeat(socket);
    });
    
    // WebRTC signaling
    socket.on('webrtc_signal', (data) => {
      this.handleWebRTCSignal(socket, data);
    });
  }
  
  handleCreateSession(socket, data, callback) {
    try {
      const deviceInfo = {
        type: data.deviceType || 'unknown', // 'web', 'android'
        name: data.deviceName || 'Unknown Device',
        platform: data.platform || 'unknown'
      };
      
      const session = this.sessionManager.createSession();
      this.sessionManager.joinSession(session.id, socket.id, deviceInfo);
      
      const connectionInfo = this.connections.get(socket.id);
      connectionInfo.sessionId = session.id;
      connectionInfo.deviceType = deviceInfo.type;
      
      // Join socket room for this session
      socket.join(session.id);
      
      const response = {
        success: true,
        sessionId: session.id,
        qrCodeUrl: `/api/qr-code/${session.id}`
      };
      
      callback?.(response);
      console.log(`Session created: ${session.id} by ${socket.id}`);
      
    } catch (error) {
      console.error('Error creating session:', error);
      callback?.({ success: false, error: error.message });
    }
  }
  
  handleJoinSession(socket, data, callback) {
    try {
      const { sessionId } = data;
      
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      
      const deviceInfo = {
        type: data.deviceType || 'unknown',
        name: data.deviceName || 'Unknown Device',
        platform: data.platform || 'unknown'
      };
      
      const session = this.sessionManager.joinSession(sessionId, socket.id, deviceInfo);
      
      const connectionInfo = this.connections.get(socket.id);
      connectionInfo.sessionId = sessionId;
      connectionInfo.deviceType = deviceInfo.type;
      
      // Join socket room
      socket.join(sessionId);
      
      // Notify other devices in the session
      socket.to(sessionId).emit('device_joined', {
        deviceId: socket.id,
        deviceInfo,
        timestamp: Date.now()
      });
      
      // Get current session devices
      const devices = Array.from(session.devices.entries()).map(([id, info]) => ({
        deviceId: id,
        deviceInfo: info
      }));
      
      const response = {
        success: true,
        sessionId,
        devices,
        message: 'Successfully joined session'
      };
      
      callback?.(response);
      console.log(`Device joined session: ${sessionId} - ${socket.id}`);
      
    } catch (error) {
      console.error('Error joining session:', error);
      callback?.({ success: false, error: error.message });
    }
  }
  
  handleClipboardData(socket, data) {
    try {
      const connectionInfo = this.connections.get(socket.id);
      if (!connectionInfo?.sessionId) {
        throw new Error('Not in a session');
      }
      
      const session = this.sessionManager.getSession(connectionInfo.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Validate clipboard data
      const validatedData = this.validateClipboardData(data);
      
      // Add to session history (limited to last 10 items)
      session.clipboardHistory.unshift({
        ...validatedData,
        fromDevice: socket.id,
        timestamp: Date.now()
      });
      
      session.clipboardHistory = session.clipboardHistory.slice(0, 10);
      
      // Broadcast to other devices in session
      socket.to(connectionInfo.sessionId).emit('clipboard_update', {
        data: validatedData,
        fromDevice: socket.id,
        timestamp: Date.now()
      });
      
      console.log(`Clipboard data broadcast in session: ${connectionInfo.sessionId}`);
      
    } catch (error) {
      console.error('Error handling clipboard data:', error);
      socket.emit('error', { type: 'clipboard_error', message: error.message });
    }
  }
  
  validateClipboardData(data) {
    const allowedTypes = ['text', 'url', 'image', 'file'];
    
    if (!data.type || !allowedTypes.includes(data.type)) {
      throw new Error('Invalid clipboard data type');
    }
    
    if (!data.content) {
      throw new Error('Clipboard content is required');
    }
    
    // Basic content validation based on type
    switch (data.type) {
      case 'text':
        if (typeof data.content !== 'string') {
          throw new Error('Text content must be a string');
        }
        if (data.content.length > 10000) {
          throw new Error('Text content too large');
        }
        break;
      case 'url':
        if (typeof data.content !== 'string') {
          throw new Error('URL content must be a string');
        }
        try {
          new URL(data.content);
        } catch {
          throw new Error('Invalid URL format');
        }
        break;
      case 'image':
        // Basic image data validation
        if (typeof data.content !== 'string' || !data.content.startsWith('data:image/')) {
          throw new Error('Invalid image data format');
        }
        if (data.content.length > 5000000) { // 5MB limit
          throw new Error('Image too large');
        }
        break;
    }
    
    return {
      type: data.type,
      content: data.content,
      metadata: data.metadata || {}
    };
  }
  
  handleWebRTCSignal(socket, data) {
    try {
      const connectionInfo = this.connections.get(socket.id);
      if (!connectionInfo?.sessionId) {
        throw new Error('Not in a session');
      }
      
      const { targetDevice, signal } = data;
      
      if (!targetDevice || !signal) {
        throw new Error('Target device and signal are required');
      }
      
      // Forward WebRTC signal to target device
      socket.to(targetDevice).emit('webrtc_signal', {
        fromDevice: socket.id,
        signal,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error handling WebRTC signal:', error);
      socket.emit('error', { type: 'webrtc_error', message: error.message });
    }
  }
  
  handleHeartbeat(socket) {
    const connectionInfo = this.connections.get(socket.id);
    if (connectionInfo) {
      connectionInfo.lastActivity = Date.now();
    }
  }
  
  handleDisconnection(socketId) {
    const connectionInfo = this.connections.get(socketId);
    
    if (connectionInfo?.sessionId) {
      // Notify other devices in the session
      const socket = require('socket.io').sockets.sockets.get(socketId);
      if (socket) {
        socket.to(connectionInfo.sessionId).emit('device_left', {
          deviceId: socketId,
          timestamp: Date.now()
        });
      }
      
      // Remove from session
      this.sessionManager.leaveSession(socketId);
    }
    
    this.connections.delete(socketId);
    console.log(`Connection cleaned up: ${socketId}`);
  }
  
  handleError(socketId, error) {
    console.error(`Connection error for ${socketId}:`, error);
    
    const socket = require('socket.io').sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('error', { 
        type: 'connection_error', 
        message: 'Connection error occurred' 
      });
    }
  }
  
  getActiveConnectionCount() {
    return this.connections.size;
  }
}

module.exports = ConnectionManager;