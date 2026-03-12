import { WebSocketServer, WebSocket } from 'ws';
import type { WsMessage } from '@tms/shared';

export type BroadcastFn = (message: WsMessage) => void;

const PING_INTERVAL_MS = 30_000;

export function setupWebSocket(wss: WebSocketServer): BroadcastFn {
  // Ping all clients every 30s to keep connections alive and detect dead sockets
  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', (ws) => {
    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  return (message: WsMessage) => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };
}
