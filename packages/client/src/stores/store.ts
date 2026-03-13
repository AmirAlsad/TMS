import { create } from 'zustand';
import type {
  Message,
  LogEntry,
  Channel,
  EvalResult,
  ReadStatus,
  ReadReceiptMode,
  BatchRun,
  SpecHistory,
} from '@tms/shared';

export type AppMode = 'playground' | 'automated';
export type Theme = 'light' | 'dark';

export interface EvalStatus {
  id: string;
  specName: string;
  status: 'running' | 'completed' | 'failed';
  currentTurn: number;
  totalTurns: number;
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('tms-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface TmsStore {
  messages: Message[];
  logs: LogEntry[];
  channel: Channel;
  botEndpoint: string;
  showConfig: boolean;
  theme: Theme;

  mode: AppMode;
  evalSpecs: string[];
  currentEval: EvalStatus | null;
  evalResults: EvalResult[];

  // Suite & batch state
  evalSuites: string[];
  activeBatchRun: BatchRun | null;
  batchRuns: BatchRun[];

  // Transcript replay state
  viewingEvalId: string | null;
  preReplayChannel: Channel | null;

  // History state
  specHistories: SpecHistory[];

  // WhatsApp state
  messageReadStates: Record<string, ReadStatus>;
  messageReactions: Record<string, { emoji: string; fromUser: boolean }[]>;
  replyingTo: Message | null;
  typingIndicator: { active: boolean; role: 'user' | 'bot' } | null;
  readReceiptMode: ReadReceiptMode;

  // Last WebSocket message (for components that need to react to specific events)
  lastWsMessage: { type: string; payload?: unknown } | null;
  setLastWsMessage: (msg: { type: string; payload?: unknown } | null) => void;

  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;

  addMessage: (message: Message) => void;
  addLog: (log: LogEntry) => void;
  setChannel: (channel: Channel) => void;
  setBotEndpoint: (endpoint: string) => void;
  toggleConfig: () => void;
  clearMessages: () => void;
  clearLogs: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  setMode: (mode: AppMode) => void;
  setEvalSpecs: (specs: string[]) => void;
  startEval: (eval_: EvalStatus) => void;
  updateEvalStatus: (update: Partial<EvalStatus> & { id: string }) => void;
  setEvalResult: (result: EvalResult) => void;
  setEvalResults: (results: EvalResult[]) => void;
  clearEval: () => void;

  // Transcript replay actions
  viewTranscript: (evalId: string) => void;
  exitTranscriptView: () => void;

  // History actions
  setSpecHistories: (histories: SpecHistory[]) => void;

  // Suite & batch actions
  setEvalSuites: (suites: string[]) => void;
  startBatchRun: (run: BatchRun) => void;
  completeBatchRun: (run: BatchRun) => void;
  setBatchRuns: (runs: BatchRun[]) => void;
  clearBatchRun: () => void;

  // WhatsApp actions
  setReadState: (messageId: string, status: ReadStatus) => void;
  addReaction: (messageId: string, emoji: string, fromUser: boolean) => void;
  removeReaction: (messageId: string, emoji: string, fromUser: boolean) => void;
  setReplyingTo: (message: Message | null) => void;
  setTypingIndicator: (indicator: { active: boolean; role: 'user' | 'bot' } | null) => void;
  setReadReceiptMode: (mode: ReadReceiptMode) => void;

}

export const useStore = create<TmsStore>((set, get) => ({
  messages: [],
  logs: [],
  channel: 'sms',
  botEndpoint: 'http://localhost:3000/chat',
  showConfig: false,
  theme: getInitialTheme(),

  mode: 'playground',
  evalSpecs: [],
  currentEval: null,
  evalResults: [],

  // Suite & batch state
  evalSuites: [],
  activeBatchRun: null,
  batchRuns: [],

  // Transcript replay state
  viewingEvalId: null,
  preReplayChannel: null,

  // History state
  specHistories: [],

  // WhatsApp state
  messageReadStates: {},
  messageReactions: {},
  replyingTo: null,
  typingIndicator: null,
  readReceiptMode: 'on_response',

  lastWsMessage: null,
  setLastWsMessage: (msg) => set({ lastWsMessage: msg }),

  connectionStatus: 'connecting',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addMessage: (message) =>
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === message.id);
      if (idx >= 0) {
        // Merge updated fields (e.g. transcription) into existing message
        const updated = [...s.messages];
        updated[idx] = { ...updated[idx], ...message };
        return { messages: updated };
      }
      return { messages: [...s.messages, message] };
    }),
  addLog: (log) => set((s) => ({ logs: [...s.logs, log] })),
  setChannel: (channel) => set({ channel, replyingTo: null, typingIndicator: null }),
  setBotEndpoint: (endpoint) => set({ botEndpoint: endpoint }),
  toggleConfig: () => set((s) => ({ showConfig: !s.showConfig })),
  clearMessages: () =>
    set((s) => {
      const channelMsgIds = new Set(
        s.messages.filter((m) => m.channel === s.channel).map((m) => m.id),
      );
      return {
        messages: s.messages.filter((m) => m.channel !== s.channel),
        messageReadStates: Object.fromEntries(
          Object.entries(s.messageReadStates).filter(([id]) => !channelMsgIds.has(id)),
        ),
        messageReactions: Object.fromEntries(
          Object.entries(s.messageReactions).filter(([id]) => !channelMsgIds.has(id)),
        ),
        replyingTo: null,
        typingIndicator: null,
      };
    }),
  clearLogs: () => set({ logs: [] }),
  setTheme: (theme) => {
    localStorage.setItem('tms-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },

  setMode: (mode) => set({ mode, viewingEvalId: null, preReplayChannel: null }),
  setEvalSpecs: (specs) => set({ evalSpecs: specs }),
  startEval: (eval_) =>
    set((s) => ({
      currentEval: eval_,
      messages: s.messages.filter((m) => m.channel !== s.channel),
    })),
  updateEvalStatus: (update) =>
    set((s) => ({
      currentEval:
        s.currentEval?.id === update.id ? { ...s.currentEval, ...update } : s.currentEval,
    })),
  setEvalResult: (result) =>
    set((s) => ({
      evalResults: [result, ...s.evalResults.filter((r) => r.id !== result.id)],
      currentEval:
        s.currentEval?.id === result.id
          ? { ...s.currentEval, status: result.status }
          : s.currentEval,
    })),
  setEvalResults: (results) => set({ evalResults: results }),
  clearEval: () => set({ currentEval: null }),

  // Transcript replay actions
  viewTranscript: (evalId) =>
    set((s) => {
      const result = s.evalResults.find((r) => r.id === evalId);
      if (!result || result.transcript.length === 0) return s;
      return {
        viewingEvalId: evalId,
        preReplayChannel: s.channel,
        channel: result.transcript[0]!.channel,
      };
    }),
  exitTranscriptView: () =>
    set((s) => ({
      viewingEvalId: null,
      channel: s.preReplayChannel ?? s.channel,
      preReplayChannel: null,
    })),

  // History actions
  setSpecHistories: (histories) => set({ specHistories: histories }),

  // Suite & batch actions
  setEvalSuites: (suites) => set({ evalSuites: suites }),
  startBatchRun: (run) =>
    set((s) => ({
      activeBatchRun: run,
      batchRuns: [run, ...s.batchRuns.filter((r) => r.id !== run.id)],
      messages: s.messages.filter((m) => m.channel !== s.channel),
    })),
  completeBatchRun: (run) =>
    set((s) => ({
      activeBatchRun: s.activeBatchRun?.id === run.id ? run : s.activeBatchRun,
      batchRuns: s.batchRuns.map((r) => (r.id === run.id ? run : r)),
    })),
  setBatchRuns: (runs) => set({ batchRuns: runs }),
  clearBatchRun: () => set({ activeBatchRun: null }),

  // WhatsApp actions
  setReadState: (messageId, status) =>
    set((s) => {
      const rank = { sent: 0, delivered: 1, read: 2 };
      const current = s.messageReadStates[messageId];
      if (current && rank[current] >= rank[status]) return s;
      return { messageReadStates: { ...s.messageReadStates, [messageId]: status } };
    }),
  addReaction: (messageId, emoji, fromUser) =>
    set((s) => {
      const existing = s.messageReactions[messageId] ?? [];
      // Skip if this exact reaction already exists (dedup optimistic + WebSocket)
      if (existing.some((r) => r.emoji === emoji && r.fromUser === fromUser)) return s;
      // Each source (user/bot) can only have one reaction per message — replace previous
      const filtered = existing.filter((r) => r.fromUser !== fromUser);
      return {
        messageReactions: {
          ...s.messageReactions,
          [messageId]: [...filtered, { emoji, fromUser }],
        },
      };
    }),
  removeReaction: (messageId, emoji, fromUser) =>
    set((s) => {
      const existing = s.messageReactions[messageId] ?? [];
      let removed = false;
      const filtered = existing.filter((r) => {
        if (!removed && r.emoji === emoji && r.fromUser === fromUser) {
          removed = true;
          return false;
        }
        return true;
      });
      return {
        messageReactions: { ...s.messageReactions, [messageId]: filtered },
      };
    }),
  setReplyingTo: (message) => set({ replyingTo: message }),
  setTypingIndicator: (indicator) => set({ typingIndicator: indicator }),
  setReadReceiptMode: (mode) => set({ readReceiptMode: mode }),

}));
