import { useEffect, useRef } from 'react';
import type { WsMessage, Message, LogEntry } from '@tms/shared';
import { useStore } from '../stores/store';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const addMessage = useStore((s) => s.addMessage);
  const addLog = useStore((s) => s.addLog);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'user:message':
        case 'bot:message':
          addMessage(msg.payload as Message);
          break;
        case 'log:entry':
          addLog(msg.payload as LogEntry);
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return () => {
      ws.close();
    };
  }, [addMessage, addLog]);

  return wsRef;
}
