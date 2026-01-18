// src/services/WebRTCManager.js
import { ApiResponse, HttpError } from '../utils/response.js';

class PeerConnection {
  constructor(peerId, sessionId, socket) {
    this.peerId = peerId;
    this.sessionId = sessionId;
    this.socket = socket;
    this.peerConnection = null;
    this.dataChannel = null;
    this.stream = null;
    this.iceCandidates = [];
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.status = 'new'; // new, connecting, connected, disconnected, failed
    this.isInitiator = false;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  setStatus(status) {
    this.status = status;
    this.updateActivity();
  }

  addIceCandidate(candidate) {
    this.iceCandidates.push({
      candidate,
      timestamp: Date.now()
    });
  }

  toJSON() {
    return {
      peerId: this.peerId,
      sessionId: this.sessionId,
      status: this.status,
      isInitiator: this.isInitiator,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      hasStream: !!this.stream
    };
  }
}

class VideoSession {
  constructor(sessionId, initiatorPeerId) {
    this.id = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sessionId = sessionId;
    this.peers = new Map(); // peerId -> PeerConnection
    this.initiatorPeerId = initiatorPeerId;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.status = 'active'; // active, ended, failed
    this.maxPeers = 10;
    this.videoConstraints = {
      video: true,
      audio: true
    };
  }

  addPeer(peerConnection) {
    if (this.peers.size >= this.maxPeers) {
      throw new Error('Video session is full');
    }
    
    this.peers.set(peerConnection.peerId, peerConnection);
    this.updateActivity();
    
    // Notify other peers about new peer
    this.broadcastToPeers(peerConnection.peerId, 'peer_joined', {
      peerId: peerConnection.peerId,
      sessionId: this.sessionId,
      videoSessionId: this.id
    });
    
    return peerConnection;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      // Clean up peer connection
      if (peer.peerConnection) {
        peer.peerConnection.close();
      }
      
      this.peers.delete(peerId);
      this.updateActivity();
      
      // Notify other peers
      this.broadcastToPeers(peerId, 'peer_left', {
        peerId,
        sessionId: this.sessionId,
        videoSessionId: this.id
      });
      
      // If session is empty, end it
      if (this.peers.size === 0) {
        this.endSession();
      }
    }
  }

  getPeer(peerId) {
    return this.peers.get(peerId);
  }

  broadcastToPeers(excludePeerId, event, data) {
    for (const [peerId, peer] of this.peers.entries()) {
      if (peerId !== excludePeerId && peer.socket && peer.socket.connected) {
        peer.socket.emit(event, data);
      }
    }
  }

  sendToPeer(targetPeerId, event, data) {
    const peer = this.peers.get(targetPeerId);
    if (peer && peer.socket && peer.socket.connected) {
      peer.socket.emit(event, data);
      return true;
    }
    return false;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  endSession() {
    this.status = 'ended';
    
    // Close all peer connections
    for (const peer of this.peers.values()) {
      if (peer.peerConnection) {
        peer.peerConnection.close();
      }
    }
    
    this.peers.clear();
  }

  getSessionInfo() {
    return {
      id: this.id,
      sessionId: this.sessionId,
      peerCount: this.peers.size,
      initiatorPeerId: this.initiatorPeerId,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      status: this.status,
      peers: Array.from(this.peers.values()).map(peer => peer.toJSON())
    };
  }
}

class WebRTCManager {
  constructor(sessionManager, connectionManager) {
    this.sessionManager = sessionManager;
    this.connectionManager = connectionManager;
    this.videoSessions = new Map(); // videoSessionId -> VideoSession
    this.peerToVideoSession = new Map(); // peerId -> videoSessionId
    this.stunServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ];
    
    this.turnServers = process.env.TURN_SERVERS 
      ? JSON.parse(process.env.TURN_SERVERS)
      : [];
    
    this.iceServers = [
      ...this.stunServers,
      ...this.turnServers
    ];
    
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  // Initialize WebRTC signaling for a socket
  initializeSignaling(socket) {
    console.log(`Initializing WebRTC signaling for socket: ${socket.id}`);
    
    // WebRTC signaling event handlers
    socket.on('webrtc_offer', (data) => this.handleOffer(socket, data));
    socket.on('webrtc_answer', (data) => this.handleAnswer(socket, data));
    socket.on('webrtc_ice_candidate', (data) => this.handleICECandidate(socket, data));
    socket.on('webrtc_start_call', (data) => this.handleStartCall(socket, data));
    socket.on('webrtc_end_call', (data) => this.handleEndCall(socket, data));
    socket.on('webrtc_toggle_media', (data) => this.handleToggleMedia(socket, data));
    socket.on('webrtc_get_peers', (data, callback) => this.handleGetPeers(socket, data, callback));
    socket.on('webrtc_join_session', (data, callback) => this.handleJoinSession(socket, data, callback));
    socket.on('webrtc_create_session', (data, callback) => this.handleCreateSession(socket, data, callback));
    
    // Clean up on disconnect
    socket.on('disconnect', () => {
      this.handlePeerDisconnect(socket.id);
    });
  }

  // Handle WebRTC offer
  async handleOffer(socket, data) {
    try {
      const { offer, targetPeerId, sessionId, videoSessionId } = data;
      
      if (!offer || !targetPeerId || !sessionId) {
        throw new Error('Missing required fields: offer, targetPeerId, sessionId');
      }
      
      const videoSession = this.videoSessions.get(videoSessionId);
      if (!videoSession) {
        throw new Error('Video session not found');
      }
      
      // Forward offer to target peer
      const forwarded = videoSession.sendToPeer(targetPeerId, 'webrtc_offer', {
        offer,
        fromPeerId: socket.id,
        sessionId,
        videoSessionId
      });
      
      if (!forwarded) {
        throw new Error('Target peer not found or not connected');
      }
      
      console.log(`Forwarded WebRTC offer from ${socket.id} to ${targetPeerId}`);
      
    } catch (error) {
      console.error('Error handling WebRTC offer:', error);
      socket.emit('webrtc_error', {
        type: 'offer_failed',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Handle WebRTC answer
  async handleAnswer(socket, data) {
    try {
      const { answer, targetPeerId, sessionId, videoSessionId } = data;
      
      if (!answer || !targetPeerId || !sessionId) {
        throw new Error('Missing required fields: answer, targetPeerId, sessionId');
      }
      
      const videoSession = this.videoSessions.get(videoSessionId);
      if (!videoSession) {
        throw new Error('Video session not found');
      }
      
      // Forward answer to target peer
      const forwarded = videoSession.sendToPeer(targetPeerId, 'webrtc_answer', {
        answer,
        fromPeerId: socket.id,
        sessionId,
        videoSessionId
      });
      
      if (!forwarded) {
        throw new Error('Target peer not found or not connected');
      }
      
      console.log(`Forwarded WebRTC answer from ${socket.id} to ${targetPeerId}`);
      
    } catch (error) {
      console.error('Error handling WebRTC answer:', error);
      socket.emit('webrtc_error', {
        type: 'answer_failed',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Handle ICE candidate
  async handleICECandidate(socket, data) {
    try {
      const { candidate, targetPeerId, sessionId, videoSessionId } = data;
      
      if (!candidate || !targetPeerId || !sessionId) {
        throw new Error('Missing required fields: candidate, targetPeerId, sessionId');
      }
      
      const videoSession = this.videoSessions.get(videoSessionId);
      if (!videoSession) {
        throw new Error('Video session not found');
      }
      
      // Forward ICE candidate to target peer
      const forwarded = videoSession.sendToPeer(targetPeerId, 'webrtc_ice_candidate', {
        candidate,
        fromPeerId: socket.id,
        sessionId,
        videoSessionId
      });
      
      if (!forwarded) {
        throw new Error('Target peer not found or not connected');
      }
      
      console.log(`Forwarded ICE candidate from ${socket.id} to ${targetPeerId}`);
      
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
      socket.emit('webrtc_error', {
        type: 'ice_candidate_failed',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Start a video call
  async handleStartCall(socket, data) {
    try {
      const { sessionId, targetPeerIds = [], videoSessionId } = data;
      
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      
      // Get the session
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      let videoSession;
      
      // If videoSessionId is provided, join existing session
      if (videoSessionId) {
        videoSession = this.videoSessions.get(videoSessionId);
        if (!videoSession) {
          throw new Error('Video session not found');
        }
        
        // Check if peer is already in session
        if (!videoSession.getPeer(socket.id)) {
          const peerConnection = new PeerConnection(socket.id, sessionId, socket);
          videoSession.addPeer(peerConnection);
          this.peerToVideoSession.set(socket.id, videoSessionId);
        }
        
      } else {
        // Create new video session
        videoSession = new VideoSession(sessionId, socket.id);
        this.videoSessions.set(videoSession.id, videoSession);
        
        // Add initiator to session
        const peerConnection = new PeerConnection(socket.id, sessionId, socket);
        peerConnection.isInitiator = true;
        videoSession.addPeer(peerConnection);
        this.peerToVideoSession.set(socket.id, videoSession.id);
        
        // Add target peers if specified
        if (targetPeerIds.length > 0) {
          for (const targetPeerId of targetPeerIds) {
            if (targetPeerId !== socket.id && session.getDevice(targetPeerId)) {
              // We'll wait for the target peer to join
              socket.to(targetPeerId).emit('webrtc_call_invitation', {
                fromPeerId: socket.id,
                sessionId,
                videoSessionId: videoSession.id,
                timestamp: Date.now()
              });
            }
          }
        }
      }
      
      // Send response to initiator
      socket.emit('webrtc_call_started', {
        success: true,
        videoSessionId: videoSession.id,
        sessionId,
        iceServers: this.iceServers,
        peers: videoSession.getSessionInfo().peers,
        timestamp: Date.now()
      });
      
      console.log(`Video call started: ${videoSession.id} by ${socket.id}`);
      
    } catch (error) {
      console.error('Error starting video call:', error);
      socket.emit('webrtc_error', {
        type: 'start_call_failed',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  // End a video call
  async handleEndCall(socket, data) {
    try {
      const { videoSessionId } = data;
      
      if (!videoSessionId) {
        throw new Error('Video session ID is required');
      }
      
      const videoSession = this.videoSessions.get(videoSessionId);
      if (!videoSession) {
        throw new Error('Video session not found');
      }
      
      // Remove peer from session
      videoSession.removePeer(socket.id);
      this.peerToVideoSession.delete(socket.id);
      
      // Notify other peers
      videoSession.broadcastToPeers(socket.id, 'webrtc_peer_ended_call', {
        peerId: socket.id,
        videoSessionId,
        timestamp: Date.now()
      });
      
      socket.emit('webrtc_call_ended', {
        success: true,
        videoSessionId,
        timestamp: Date.now()
      });
      
      console.log(`Peer ${socket.id} ended call in session ${videoSessionId}`);
      
    } catch (error) {
      console.error('Error ending video call:', error);
      socket.emit('webrtc_error', {
        type: 'end_call_failed',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Toggle media (audio/video)
  async handleToggleMedia(socket, data) {
    try {
      const { videoSessionId, mediaType, enabled } = data;
      
      if (!videoSessionId || !mediaType) {
        throw new Error('Video session ID and media type are required');
      }
      
      const videoSession = this.videoSessions.get(videoSessionId);
      if (!videoSession) {
        throw new Error('Video session not found');
      }
      
      // Broadcast to other peers in session
      videoSession.broadcastToPeers(socket.id, 'webrtc_media_toggled', {
        peerId: socket.id,
        videoSessionId,
        mediaType,
        enabled,
        timestamp: Date.now()
      });
      
      socket.emit('webrtc_media_toggled_ack', {
        success: true,
        mediaType,
        enabled,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error toggling media:', error);
      socket.emit('webrtc_error', {
        type: 'toggle_media_failed',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }

  // Get available peers for video call
  async handleGetPeers(socket, data, callback) {
    try {
      const { sessionId } = data;
      
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Get all devices in session
      const devices = Array.from(session.devices.entries())
        .filter(([deviceId]) => deviceId !== socket.id) // Exclude self
        .map(([deviceId, deviceInfo]) => ({
          deviceId,
          name: deviceInfo.name,
          type: deviceInfo.type,
          platform: deviceInfo.platform,
          isOnline: this.connectionManager.isDeviceOnline(deviceId),
          inVideoCall: this.peerToVideoSession.has(deviceId)
        }));
      
      if (callback) {
        callback({
          success: true,
          sessionId,
          devices,
          count: devices.length,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      console.error('Error getting peers:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
  }

  // Join an existing video session
  async handleJoinSession(socket, data, callback) {
    try {
      const { videoSessionId, sessionId } = data;
      
      if (!videoSessionId || !sessionId) {
        throw new Error('Video session ID and session ID are required');
      }
      
      const videoSession = this.videoSessions.get(videoSessionId);
      if (!videoSession) {
        throw new Error('Video session not found');
      }
      
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Check if peer is already in session
      if (videoSession.getPeer(socket.id)) {
        throw new Error('Peer already in video session');
      }
      
      // Add peer to video session
      const peerConnection = new PeerConnection(socket.id, sessionId, socket);
      videoSession.addPeer(peerConnection);
      this.peerToVideoSession.set(socket.id, videoSessionId);
      
      if (callback) {
        callback({
          success: true,
          videoSessionId,
          sessionId,
          iceServers: this.iceServers,
          peers: videoSession.getSessionInfo().peers,
          timestamp: Date.now()
        });
      }
      
      console.log(`Peer ${socket.id} joined video session ${videoSessionId}`);
      
    } catch (error) {
      console.error('Error joining video session:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
  }

  // Create a new video session
  async handleCreateSession(socket, data, callback) {
    try {
      const { sessionId } = data;
      
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Create new video session
      const videoSession = new VideoSession(sessionId, socket.id);
      this.videoSessions.set(videoSession.id, videoSession);
      
      // Add initiator to session
      const peerConnection = new PeerConnection(socket.id, sessionId, socket);
      peerConnection.isInitiator = true;
      videoSession.addPeer(peerConnection);
      this.peerToVideoSession.set(socket.id, videoSession.id);
      
      if (callback) {
        callback({
          success: true,
          videoSessionId: videoSession.id,
          sessionId,
          iceServers: this.iceServers,
          timestamp: Date.now()
        });
      }
      
      console.log(`Created video session ${videoSession.id} for session ${sessionId}`);
      
    } catch (error) {
      console.error('Error creating video session:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }
  }

  // Handle peer disconnect
  handlePeerDisconnect(peerId) {
    const videoSessionId = this.peerToVideoSession.get(peerId);
    if (videoSessionId) {
      const videoSession = this.videoSessions.get(videoSessionId);
      if (videoSession) {
        videoSession.removePeer(peerId);
      }
      this.peerToVideoSession.delete(peerId);
    }
  }

  // Clean up expired video sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [videoSessionId, videoSession] of this.videoSessions.entries()) {
      // Check if session is empty or inactive for 30 minutes
      if (videoSession.peers.size === 0 || 
          (now - videoSession.lastActivity > 30 * 60 * 1000)) {
        
        videoSession.endSession();
        this.videoSessions.delete(videoSessionId);
        
        // Clean up peer mappings
        for (const [peerId, sessionId] of this.peerToVideoSession.entries()) {
          if (sessionId === videoSessionId) {
            this.peerToVideoSession.delete(peerId);
          }
        }
        
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired video sessions`);
    }
  }

  // Get video session statistics
  getStats() {
    const sessions = Array.from(this.videoSessions.values());
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      totalPeers: sessions.reduce((sum, session) => sum + session.peers.size, 0),
      averagePeersPerSession: sessions.length > 0 
        ? sessions.reduce((sum, session) => sum + session.peers.size, 0) / sessions.length 
        : 0,
      stunServers: this.stunServers.length,
      turnServers: this.turnServers.length
    };
  }

  // Get video session by ID
  getVideoSession(videoSessionId) {
    return this.videoSessions.get(videoSessionId);
  }

  // Get all video sessions for a regular session
  getVideoSessionsForSession(sessionId) {
    const sessions = [];
    for (const videoSession of this.videoSessions.values()) {
      if (videoSession.sessionId === sessionId) {
        sessions.push(videoSession.getSessionInfo());
      }
    }
    return sessions;
  }

  // Graceful shutdown
  destroy() {
    clearInterval(this.cleanupInterval);
    
    // End all video sessions
    for (const videoSession of this.videoSessions.values()) {
      videoSession.endSession();
    }
    
    this.videoSessions.clear();
    this.peerToVideoSession.clear();
  }
}

export default WebRTCManager;