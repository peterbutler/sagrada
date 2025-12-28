import { WebSocketServer, WebSocket } from 'ws';
import { SensorUpdate } from '../types/index.js';
import { getCurrentReadings } from '../services/status.js';

// Track all connected clients
const clients = new Set<WebSocket>();

/**
 * Set up WebSocket server handlers
 */
export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', async (ws) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    // Send current readings on connect
    try {
      const readings = await getCurrentReadings();
      for (const reading of readings) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(reading));
        }
      }
    } catch (err) {
      console.error('Error sending initial readings:', err);
    }

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(ws);
    });
  });
}

/**
 * Broadcast a sensor update to all connected clients
 */
export function broadcast(update: SensorUpdate): void {
  const message = JSON.stringify(update);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Get count of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}
