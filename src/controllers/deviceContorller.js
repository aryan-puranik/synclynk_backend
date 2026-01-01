// src/controllers/deviceController.js
import { ApiResponse } from '../utils/response.js';

export class DeviceController {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  // Get device info
  getDevice = async (req, res) => {
    try {
      const { sessionId, deviceId } = req.params;
      const device = req.device;
      const session = req.session;
      
      const deviceInfo = {
        deviceId,
        type: device.type,
        name: device.name,
        platform: device.platform,
        joinedAt: device.joinedAt,
        lastSeen: device.lastSeen,
        sessionId,
        isOnline: this.isDeviceOnline(deviceId)
      };
      
      res.json(
        ApiResponse.success(deviceInfo, 'Device information retrieved')
      );
    } catch (error) {
      console.error('Error getting device:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get device information', error.message)
      );
    }
  };

  // Update device info
  updateDevice = async (req, res) => {
    try {
      const { sessionId, deviceId } = req.params;
      const { name } = req.body;
      const session = req.session;
      const device = req.device;
      
      if (name && typeof name === 'string' && name.length <= 100) {
        device.name = name;
        device.lastSeen = Date.now();
      }
      
      res.json(
        ApiResponse.success(
          { name: device.name },
          'Device updated successfully'
        )
      );
    } catch (error) {
      console.error('Error updating device:', error);
      res.status(500).json(
        ApiResponse.error('Failed to update device', error.message)
      );
    }
  };

  // List all devices in session
  listDevices = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = req.session;
      
      const devices = Array.from(session.devices.entries()).map(([id, info]) => ({
        deviceId: id,
        type: info.type,
        name: info.name,
        platform: info.platform,
        joinedAt: info.joinedAt,
        lastSeen: info.lastSeen,
        isOnline: this.isDeviceOnline(id)
      }));
      
      res.json(
        ApiResponse.success(devices, 'Devices retrieved successfully')
      );
    } catch (error) {
      console.error('Error listing devices:', error);
      res.status(500).json(
        ApiResponse.error('Failed to list devices', error.message)
      );
    }
  };

  // Check if device is online (helper method)
  isDeviceOnline(deviceId) {
    // This would check with connection manager
    // For now, return true if device exists in any session
    const session = this.sessionManager.getSessionBySocket(deviceId);
    return !!session;
  }
}