// src/controllers/qrController.js
import { ApiResponse } from '../utils/response.js';
import qr from 'qr-image';

export class QRController {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  // Generate QR code image
  generateQRCode = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = req.session;
      const { format = 'png', size = 300 } = req.query;
      
      const qrData = {
        sessionId,
        serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
        timestamp: Date.now(),
        type: 'clipboard-pairing',
        version: '1.0.0'
      };
      
      const jsonData = JSON.stringify(qrData);
      
      switch (format.toLowerCase()) {
        case 'svg':
          const svg = qr.imageSync(jsonData, { type: 'svg', size: parseInt(size) });
          res.type('svg');
          res.send(svg);
          break;
          
        case 'png':
          const png = qr.imageSync(jsonData, { type: 'png', size: parseInt(size) });
          res.type('png');
          res.send(png);
          break;
          
        case 'json':
          res.json(
            ApiResponse.success({
              qrData: btoa(jsonData),
              sessionId,
              serverUrl: qrData.serverUrl,
              timestamp: qrData.timestamp
            }, 'QR data generated successfully')
          );
          break;
          
        default:
          res.status(400).json(
            ApiResponse.error('Invalid format. Use svg, png, or json')
          );
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).json(
        ApiResponse.error('Failed to generate QR code', error.message)
      );
    }
  };

  // Get QR data as JSON (for manual entry)
  getQRData = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = req.session;
      
      const qrData = {
        sessionId,
        serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
        timestamp: Date.now(),
        type: 'clipboard-pairing',
        version: '1.0.0'
      };
      
      res.json(
        ApiResponse.success({
          qrData: btoa(JSON.stringify(qrData)),
          sessionId,
          serverUrl: qrData.serverUrl,
          expiresIn: '5 minutes'
        }, 'QR data retrieved successfully')
      );
    } catch (error) {
      console.error('Error getting QR data:', error);
      res.status(500).json(
        ApiResponse.error('Failed to get QR data', error.message)
      );
    }
  };

  // Decode QR data
  decodeQRData = async (req, res) => {
    try {
      const { qrData } = req.body;
      
      if (!qrData) {
        return res.status(400).json(
          ApiResponse.error('QR data is required')
        );
      }
      
      let decodedData;
      try {
        decodedData = JSON.parse(atob(qrData));
      } catch {
        return res.status(400).json(
          ApiResponse.error('Invalid QR data format')
        );
      }
      
      // Validate QR data structure
      if (decodedData.type !== 'clipboard-pairing') {
        return res.status(400).json(
          ApiResponse.error('Invalid QR code type')
        );
      }
      
      // Check expiration (5 minutes)
      if (Date.now() - decodedData.timestamp > 5 * 60 * 1000) {
        return res.status(400).json(
          ApiResponse.error('QR code has expired')
        );
      }
      
      // Verify session exists
      const session = this.sessionManager.getSession(decodedData.sessionId);
      if (!session) {
        return res.status(404).json(
          ApiResponse.error('Session not found or expired')
        );
      }
      
      res.json(
        ApiResponse.success({
          sessionId: decodedData.sessionId,
          serverUrl: decodedData.serverUrl,
          isValid: true,
          expiresAt: decodedData.timestamp + (5 * 60 * 1000)
        }, 'QR data decoded successfully')
      );
    } catch (error) {
      console.error('Error decoding QR data:', error);
      res.status(500).json(
        ApiResponse.error('Failed to decode QR data', error.message)
      );
    }
  };
}

export default QRController;