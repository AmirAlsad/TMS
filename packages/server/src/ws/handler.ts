import { WebSocketServer, WebSocket } from 'ws';
import type { WsMessage } from '@tms/shared';

export type BroadcastFn = (message: WsMessage) => void;

export function setupWebSocket(wss: WebSocketServer): BroadcastFn {
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
