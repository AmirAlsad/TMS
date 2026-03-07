import { useEffect, useRef } from 'react';
import type {
  WsMessage,
  Message,
  LogEntry,
  EvalResult,
  WhatsAppReaction,
  WhatsAppReadReceipt,
  WhatsAppTypingEvent,
} from '@tms/shared';
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
  const setReadState = useStore((s) => s.setReadState);
  const addReaction = useStore((s) => s.addReaction);
  const removeReaction = useStore((s) => s.removeReaction);
  const setTypingIndicator = useStore((s) => s.setTypingIndicator);

  useEffect(() => {
    let closed = false;
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
          // Clear typing indicator when a message arrives
          setTypingIndicator(null);
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
        case 'whatsapp:read_receipt': {
          const receipt = msg.payload as WhatsAppReadReceipt;
          setReadState(receipt.messageId, 'read');
          break;
        }
        case 'whatsapp:reaction': {
          const reaction = msg.payload as WhatsAppReaction;
          addReaction(reaction.targetMessageId, reaction.emoji, reaction.fromUser);
          break;
        }
        case 'whatsapp:reaction_removed': {
          const reaction = msg.payload as WhatsAppReaction;
          removeReaction(reaction.targetMessageId, reaction.emoji, reaction.fromUser);
          break;
        }
        case 'whatsapp:typing_start': {
          const typing = msg.payload as WhatsAppTypingEvent;
          setTypingIndicator({ active: true, role: typing.fromUser ? 'user' : 'bot' });
          break;
        }
        case 'whatsapp:typing_stop':
          setTypingIndicator(null);
          break;
      }
    };

    ws.onerror = (err) => {
      if (!closed) {
        console.error('WebSocket error:', err);
      }
    };

    return () => {
      closed = true;
      ws.close();
    };
  }, [
    addMessage,
    addLog,
    updateEvalStatus,
    setEvalResult,
    setReadState,
    addReaction,
    removeReaction,
    setTypingIndicator,
  ]);

  return wsRef;
}
