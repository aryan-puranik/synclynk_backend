// src/controllers/clipboardController.js
import { ApiResponse } from '../utils/response.js';

export class ClipboardController {
  constructor(clipboardManager, sessionManager) {
    this.clipboardManager = clipboardManager;
    this.sessionManager = sessionManager;
  }

  // Send clipboard data to session
  sendClipboardData = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const data = req.body;
      const { deviceId } = req.query; // Device sending the data
      
      if (!deviceId) {
        return res.status(400).json(
          ApiResponse.error('Device ID is required')
        );
      }
      
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json(
          ApiResponse.error('Session not found')
        );
      }
      
      // Check if device is in session
      if (!session.getDevice(deviceId)) {
        return res.status(403).json(
          ApiResponse.error('Device not in session')
        );
      }
      
      // Get socket for the sending device (mock for REST API)
      const socket = { id: deviceId };
      
      // Process clipboard data
      const result = await this.clipboardManager.processClipboardData(socket, data);
      
      res.json(
        ApiResponse.success(result, 'Clipboard data sent successfully')
      );
    } catch (error) {
      console.error('Error sending clipboard data:', error);
      res.status(500).json(
        ApiResponse.error('Failed to send clipboard data', error.message)
      );
    }
  };

  // Get clipboard history for a session
  getClipboardHistory = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = req.session;
      const { page = 1, limit = 20 } = req.query;
      
      const history = session.clipboardHistory || [];
      
      // Paginate history (newest first)
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedHistory = history.slice(startIndex, endIndex);
      
      res.json(
        ApiResponse.paginated(
          paginatedHistory,
          page,
          limit,
          history.length
        )
      );
    } catch (error) {
      console.error('Error getting clipboard history:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get clipboard history', error.message)
      );
    }
  };

  // Get queued messages for a device
  getQueuedMessages = async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { limit = 10 } = req.query;
      
      const messages = this.clipboardManager.getQueuedMessages(deviceId, limit);
      
      res.json(
        ApiResponse.success({
          messages,
          count: messages.length,
          deviceId
        }, 'Queued messages retrieved')
      );
    } catch (error) {
      console.error('Error getting queued messages:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get queued messages', error.message)
      );
    }
  };

  // Clear queued messages for a device
  clearQueuedMessages = async (req, res) => {
    try {
      const { deviceId } = req.params;
      
      this.clipboardManager.clearQueueForDevice(deviceId);
      
      res.json(
        ApiResponse.success(null, 'Queued messages cleared')
      );
    } catch (error) {
      console.error('Error clearing queued messages:', error);
      res.status(500).json(
        ApiResponse.error('Failed to clear queued messages', error.message)
      );
    }
  };

  // Get clipboard item by ID
  getClipboardItem = async (req, res) => {
    try {
      const { sessionId, itemId } = req.params;
      const session = req.session;
      
      const item = session.clipboardHistory.find(item => item.id === itemId);
      
      if (!item) {
        return res.status(404).json(
          ApiResponse.error('Clipboard item not found')
        );
      }
      
      res.json(
        ApiResponse.success(item, 'Clipboard item retrieved')
      );
    } catch (error) {
      console.error('Error getting clipboard item:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get clipboard item', error.message)
      );
    }
  };
}