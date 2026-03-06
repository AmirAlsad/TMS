import { useEffect, useRef } from 'react';
import type { WsMessage, Message, LogEntry, EvalResult } from '@tms/shared';
import { useStore } from '../stores/store';

interface EvalStatusPayload {
  evalId: string;
  status: 'running' | 'completed' | 'failed';
  currentTurn: number;
  totalTurns: number;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const addMessage = useStore((s) => s.addMessage);
  const addLog = useStore((s) => s.addLog);
  const updateEvalStatus = useStore((s) => s.updateEvalStatus);
  const setEvalResult = useStore((s) => s.setEvalResult);

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
        case 'eval:status': {
          const status = msg.payload as EvalStatusPayload;
          updateEvalStatus({
            id: status.evalId,
            status: status.status,
            currentTurn: status.currentTurn,
            totalTurns: status.totalTurns,
          });
          break;
        }
        case 'eval:result':
          setEvalResult(msg.payload as EvalResult);
          break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return () => {
      ws.close();
    };
  }, [addMessage, addLog, updateEvalStatus, setEvalResult]);

  return wsRef;
}
