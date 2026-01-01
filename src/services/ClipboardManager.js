// src/services/ClipboardManager.js
class ClipboardItem {
  constructor(data, fromDevice, timestamp) {
    this.id = Date.now() + Math.random().toString(36).substr(2, 9);
    this.type = data.type;
    this.content = data.content;
    this.metadata = data.metadata || {};
    this.fromDevice = fromDevice;
    this.timestamp = timestamp || Date.now();
    this.deliveredTo = new Set(); // Track which devices have received this
  }

  canDeliverTo(deviceId) {
    return !this.deliveredTo.has(deviceId);
  }

  markDelivered(deviceId) {
    this.deliveredTo.add(deviceId);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      metadata: this.metadata,
      fromDevice: this.fromDevice,
      timestamp: this.timestamp
    };
  }
}

class ClipboardManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.messageQueues = new Map(); // deviceId -> ClipboardItem[]
    this.maxQueueSize = 50; // Maximum messages to queue per device
    this.maxMessageSize = 10 * 1024 * 1024; // 10MB max per message
  }

  // Process incoming clipboard data
  async processClipboardData(socket, data) {
    try {
      // Validate the data
      const validatedData = this.validateClipboardData(data);
      
      // Get session info
      const session = this.sessionManager.getSessionBySocket(socket.id);
      if (!session) {
        throw new Error('Device not in any session');
      }

      // Create clipboard item
      const clipboardItem = new ClipboardItem(
        validatedData,
        socket.id,
        Date.now()
      );

      // Store in session history (limited to last 20 items)
      session.clipboardHistory.unshift(clipboardItem.toJSON());
      session.clipboardHistory = session.clipboardHistory.slice(0, 20);

      // Route to other devices in session
      const deliveryResults = await this.routeToDevices(session, clipboardItem, socket.id);

      return {
        success: true,
        messageId: clipboardItem.id,
        deliveredTo: deliveryResults.delivered,
        queuedFor: deliveryResults.queued
      };
    } catch (error) {
      console.error('Error processing clipboard data:', error);
      throw error;
    }
  }

  // Validate clipboard data
  validateClipboardData(data) {
    const allowedTypes = ['text', 'url', 'image', 'file'];
    
    // Check required fields
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid clipboard data format');
    }

    if (!data.type || !allowedTypes.includes(data.type)) {
      throw new Error(`Invalid clipboard type. Allowed: ${allowedTypes.join(', ')}`);
    }

    if (!data.content && data.type !== 'file') {
      throw new Error('Clipboard content is required');
    }

    // Type-specific validation
    switch (data.type) {
      case 'text':
        if (typeof data.content !== 'string') {
          throw new Error('Text content must be a string');
        }
        if (data.content.length > 100000) { // 100KB limit for text
          throw new Error('Text content too large (max 100KB)');
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
        if (data.content.length > 2000) {
          throw new Error('URL too long');
        }
        break;

      case 'image':
        if (typeof data.content !== 'string') {
          throw new Error('Image content must be a string');
        }
        // Validate base64 image
        if (!data.content.startsWith('data:image/')) {
          throw new Error('Invalid image data format. Must be data:image/...');
        }
        if (data.content.length > this.maxMessageSize) {
          throw new Error(`Image too large (max ${this.maxMessageSize / 1024 / 1024}MB)`);
        }
        // Validate base64 format
        const base64Data = data.content.split(',')[1];
        if (!base64Data || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
          throw new Error('Invalid base64 image data');
        }
        break;

      case 'file':
        // For files, content might be a reference or metadata
        if (!data.metadata || !data.metadata.filename) {
          throw new Error('File metadata must include filename');
        }
        if (data.content && data.content.length > this.maxMessageSize) {
          throw new Error(`File too large (max ${this.maxMessageSize / 1024 / 1024}MB)`);
        }
        break;
    }

    // Validate metadata
    if (data.metadata) {
      if (typeof data.metadata !== 'object') {
        throw new Error('Metadata must be an object');
      }
      
      // Limit metadata size
      const metadataSize = JSON.stringify(data.metadata).length;
      if (metadataSize > 10000) { // 10KB max for metadata
        throw new Error('Metadata too large');
      }
    }

    return {
      type: data.type,
      content: data.content || '',
      metadata: data.metadata || {}
    };
  }

  // Route clipboard item to other devices
  async routeToDevices(session, clipboardItem, fromDeviceId) {
    const results = {
      delivered: [],
      queued: []
    };

    // Get all devices in session except sender
    const devices = Array.from(session.devices.keys()).filter(id => id !== fromDeviceId);

    for (const deviceId of devices) {
      try {
        // Check if device is online (has active socket connection)
        const deviceSocket = this.getSocketById(deviceId);
        
        if (deviceSocket && deviceSocket.connected) {
          // Device is online, send immediately
          await this.sendToDevice(deviceSocket, clipboardItem);
          clipboardItem.markDelivered(deviceId);
          results.delivered.push(deviceId);
        } else {
          // Device is offline, queue message
          this.queueMessageForDevice(deviceId, clipboardItem);
          results.queued.push(deviceId);
        }
      } catch (error) {
        console.error(`Failed to route to device ${deviceId}:`, error);
        // Queue message for retry
        this.queueMessageForDevice(deviceId, clipboardItem);
        results.queued.push(deviceId);
      }
    }

    return results;
  }

  // Send clipboard item to specific device
  async sendToDevice(socket, clipboardItem) {
    return new Promise((resolve, reject) => {
      if (!socket || !socket.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      socket.emit('clipboard_update', {
        ...clipboardItem.toJSON(),
        isQueued: false,
        timestamp: Date.now()
      }, (ack) => {
        if (ack && ack.success) {
          resolve();
        } else {
          reject(new Error('Device did not acknowledge receipt'));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Send timeout'));
      }, 10000);
    });
  }

  // Queue management for offline devices
  queueMessageForDevice(deviceId, clipboardItem) {
    if (!this.messageQueues.has(deviceId)) {
      this.messageQueues.set(deviceId, []);
    }

    const queue = this.messageQueues.get(deviceId);
    
    // Limit queue size
    if (queue.length >= this.maxQueueSize) {
      // Remove oldest message
      queue.pop();
    }

    // Add to front of queue (newest first)
    queue.unshift(clipboardItem);
  }

  // Get queued messages for device
  getQueuedMessages(deviceId, limit = 10) {
    if (!this.messageQueues.has(deviceId)) {
      return [];
    }

    const queue = this.messageQueues.get(deviceId);
    return queue.slice(0, limit).map(item => item.toJSON());
  }

  // Deliver queued messages when device comes online
  async deliverQueuedMessages(deviceId, socket) {
    if (!this.messageQueues.has(deviceId)) {
      return { delivered: 0, failed: 0 };
    }

    const queue = this.messageQueues.get(deviceId);
    const results = { delivered: 0, failed: 0 };

    // Process messages in reverse order (oldest first)
    const messagesToDeliver = [...queue].reverse();
    
    for (const message of messagesToDeliver) {
      try {
        await this.sendToDevice(socket, message);
        message.markDelivered(deviceId);
        
        // Remove from queue after successful delivery
        const index = queue.findIndex(item => item.id === message.id);
        if (index !== -1) {
          queue.splice(index, 1);
        }
        
        results.delivered++;
      } catch (error) {
        console.error(`Failed to deliver queued message to ${deviceId}:`, error);
        results.failed++;
        // Keep message in queue for retry
      }
    }

    // Clean up empty queue
    if (queue.length === 0) {
      this.messageQueues.delete(deviceId);
    }

    return results;
  }

  // Clear queue for device (when leaving session)
  clearQueueForDevice(deviceId) {
    this.messageQueues.delete(deviceId);
  }

  // Get socket by ID (helper method)
  getSocketById(socketId) {
    // This should be implemented by the main server to provide socket access
    // We'll rely on the ConnectionManager to provide this
    return null; // Will be set by ConnectionManager
  }

  // Set socket access function
  setSocketAccessor(getSocketFunction) {
    this.getSocketById = getSocketFunction;
  }

  // Statistics
  getStats() {
    const queues = Array.from(this.messageQueues.entries());
    return {
      totalQueues: queues.length,
      totalQueuedMessages: queues.reduce((sum, [, queue]) => sum + queue.length, 0),
      maxQueueSize: this.maxQueueSize,
      maxMessageSize: this.maxMessageSize
    };
  }
}

export default ClipboardManager;