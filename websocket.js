const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // Map to store client connections with their user IDs

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  handleConnection(ws, req) {
    // Extract token from query parameters
    const url = new URL(req.url, 'ws://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication token required');
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      // Store the connection with the user ID
      this.clients.set(userId, ws);

      console.log(`Client connected: ${userId}`);

      ws.on('message', (message) => {
        this.handleMessage(userId, message);
      });

      ws.on('close', () => {
        console.log(`Client disconnected: ${userId}`);
        this.clients.delete(userId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${userId}:`, error);
      });

      // Send initial connection success message
      this.sendToClient(userId, {
        type: 'connection',
        payload: { status: 'connected', userId }
      });

    } catch (error) {
      console.error('WebSocket authentication error:', error);
      ws.close(4002, 'Invalid authentication token');
    }
  }

  handleMessage(userId, message) {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;

      switch (type) {
        case 'analysis_request':
          this.handleAnalysisRequest(userId, payload);
          break;
        case 'treatment_update':
          this.handleTreatmentUpdate(userId, payload);
          break;
        default:
          console.warn(`Unknown message type received: ${type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  async handleAnalysisRequest(userId, payload) {
    try {
      // Here you would process the analysis request
      // For example, starting an AI analysis job
      this.sendToClient(userId, {
        type: 'analysis_status',
        payload: { status: 'processing' }
      });

      // Simulate analysis process
      setTimeout(() => {
        this.sendToClient(userId, {
          type: 'analysis_result',
          payload: {
            status: 'completed',
            result: {
              severity: 'moderate',
              confidence: 0.85,
              recommendations: [
                'Apply prescribed topical treatment',
                'Avoid known triggers',
                'Keep the affected area moisturized'
              ]
            }
          }
        });
      }, 2000);

    } catch (error) {
      console.error('Error handling analysis request:', error);
      this.sendToClient(userId, {
        type: 'analysis_error',
        payload: { error: 'Failed to process analysis request' }
      });
    }
  }

  async handleTreatmentUpdate(userId, payload) {
    try {
      // Here you would process the treatment update
      // For example, saving to database and notifying relevant parties
      this.sendToClient(userId, {
        type: 'treatment_status',
        payload: { status: 'saved' }
      });

    } catch (error) {
      console.error('Error handling treatment update:', error);
      this.sendToClient(userId, {
        type: 'treatment_error',
        payload: { error: 'Failed to process treatment update' }
      });
    }
  }

  sendToClient(userId, data) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (error) {
        console.error(`Error sending message to client ${userId}:`, error);
      }
    }
  }

  broadcast(data, excludeUserId = null) {
    this.clients.forEach((client, userId) => {
      if (userId !== excludeUserId && client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(data));
        } catch (error) {
          console.error(`Error broadcasting to client ${userId}:`, error);
        }
      }
    });
  }
}

module.exports = WebSocketServer;
