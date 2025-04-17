const WebSocket = require('ws');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    
    this.wss.on('connection', (ws) => {
      console.log('New WebSocket connection');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
      });

      // Send initial connection success message
      ws.send(JSON.stringify({ type: 'connection', status: 'connected' }));
    });
  }

  handleMessage(ws, data) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      // Add more message handlers here
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  }

  // Broadcast to all connected clients
  broadcast(data) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

module.exports = WebSocketServer;
