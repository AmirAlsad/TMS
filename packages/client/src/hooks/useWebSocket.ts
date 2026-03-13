import { useEffect, useRef, useCallback } from 'react';
import type {
  WsMessage,
  Message,
  LogEntry,
  EvalResult,
  BatchRun,
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

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const addMessage = useStore((s) => s.addMessage);
  const addLog = useStore((s) => s.addLog);
  const updateEvalStatus = useStore((s) => s.updateEvalStatus);
  const setEvalResult = useStore((s) => s.setEvalResult);
  const startBatchRun = useStore((s) => s.startBatchRun);
  const completeBatchRun = useStore((s) => s.completeBatchRun);
  const setSpecHistories = useStore((s) => s.setSpecHistories);
  const setReadState = useStore((s) => s.setReadState);
  const addReaction = useStore((s) => s.addReaction);
  const removeReaction = useStore((s) => s.removeReaction);
  const setTypingIndicator = useStore((s) => s.setTypingIndicator);
  const setConnectionStatus = useStore((s) => s.setConnectionStatus);
  const setLastWsMessage = useStore((s) => s.setLastWsMessage);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const refreshHistory = () => {
        fetch('/api/eval/history')
          .then((res) => (res.ok ? res.json() : { histories: [] }))
          .then((data) => setSpecHistories(data.histories ?? []))
          .catch(() => {});
      };

      const msg: WsMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'user:message':
        case 'bot:message':
          addMessage(msg.payload as Message);
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
        case 'eval:started':
          setEvalResult(msg.payload as EvalResult);
          break;
        case 'eval:result':
          setEvalResult(msg.payload as EvalResult);
          refreshHistory();
          break;
        case 'batch:started':
          startBatchRun(msg.payload as BatchRun);
          break;
        case 'batch:completed':
          completeBatchRun(msg.payload as BatchRun);
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
        case 'replay:started':
        case 'replay:message':
        case 'replay:completed':
          setLastWsMessage({ type: msg.type, payload: msg.payload });
          break;
      }
    },
    [
      addMessage,
      addLog,
      updateEvalStatus,
      setEvalResult,
      startBatchRun,
      completeBatchRun,
      setSpecHistories,
      setReadState,
      addReaction,
      removeReaction,
      setTypingIndicator,
      setLastWsMessage,
    ],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setConnectionStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      setConnectionStatus('connected');
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    };

    ws.onmessage = handleMessage;

    ws.onerror = (err) => {
      if (mountedRef.current) {
        console.error('WebSocket error:', err);
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionStatus('disconnected');
      // Schedule reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [handleMessage, setConnectionStatus]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return wsRef;
}
