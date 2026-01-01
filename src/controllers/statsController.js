// src/controllers/statsController.js
import { ApiResponse } from '../utils/response.js';

export class StatsController {
  constructor(sessionManager, connectionManager, clipboardManager) {
    this.sessionManager = sessionManager;
    this.connectionManager = connectionManager;
    this.clipboardManager = clipboardManager;
  }

  // Get system health stats
  getHealth = async (req, res) => {
    try {
      const stats = {
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        },
        sessions: {
          active: this.sessionManager.getActiveSessionCount(),
          totalDevices: this.getTotalDeviceCount(),
          maxDevicesPerSession: 5
        },
        connections: {
          active: this.connectionManager.getActiveConnectionCount(),
          total: this.connectionManager.connections.size
        },
        clipboard: this.clipboardManager.getStats(),
        timestamp: new Date().toISOString()
      };
      
      res.json(
        ApiResponse.success(stats, 'System health check')
      );
    } catch (error) {
      console.error('Error getting health stats:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get health stats', error.message)
      );
    }
  };

  // Get detailed statistics
  getStatistics = async (req, res) => {
    try {
      const { timeframe = 'hour' } = req.query;
      
      const stats = {
        timeframe,
        sessions: this.getSessionStats(timeframe),
        clipboard: this.getClipboardStats(timeframe),
        devices: this.getDeviceStats(timeframe),
        performance: this.getPerformanceStats()
      };
      
      res.json(
        ApiResponse.success(stats, 'System statistics')
      );
    } catch (error) {
      console.error('Error getting statistics:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get statistics', error.message)
      );
    }
  };

  // Get real-time metrics
  getMetrics = async (req, res) => {
    try {
      const metrics = {
        activeConnections: this.connectionManager.getActiveConnectionCount(),
        activeSessions: this.sessionManager.getActiveSessionCount(),
        clipboardQueueSize: this.clipboardManager.getStats().totalQueuedMessages,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        timestamp: Date.now()
      };
      
      res.json(
        ApiResponse.success(metrics, 'Real-time metrics')
      );
    } catch (error) {
      console.error('Error getting metrics:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get metrics', error.message)
      );
    }
  };

  // Helper methods
  getTotalDeviceCount() {
    let total = 0;
    for (const session of this.sessionManager.sessions.values()) {
      total += session.devices.size;
    }
    return total;
  }

  getSessionStats(timeframe) {
    const sessions = Array.from(this.sessionManager.sessions.values());
    
    return {
      total: sessions.length,
      active: sessions.filter(s => !s.isExpired()).length,
      expired: sessions.filter(s => s.isExpired()).length,
      averageDevices: sessions.reduce((sum, s) => sum + s.devices.size, 0) / sessions.length || 0,
      maxDevices: Math.max(...sessions.map(s => s.devices.size), 0)
    };
  }

  getClipboardStats(timeframe) {
    const stats = this.clipboardManager.getStats();
    const sessions = Array.from(this.sessionManager.sessions.values());
    
    let totalMessages = 0;
    for (const session of sessions) {
      totalMessages += session.clipboardHistory.length;
    }
    
    return {
      ...stats,
      totalMessages,
      averageMessagesPerSession: totalMessages / sessions.length || 0
    };
  }

  getDeviceStats(timeframe) {
    const sessions = Array.from(this.sessionManager.sessions.values());
    const deviceTypes = {};
    
    for (const session of sessions) {
      for (const device of session.devices.values()) {
        const type = device.type || 'unknown';
        deviceTypes[type] = (deviceTypes[type] || 0) + 1;
      }
    }
    
    return {
      total: this.getTotalDeviceCount(),
      byType: deviceTypes
    };
  }

  getPerformanceStats() {
    return {
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        rss: process.memoryUsage().rss / 1024 / 1024
      },
      cpu: process.cpuUsage()
    };
  }
}