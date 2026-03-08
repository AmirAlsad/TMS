import { create } from 'zustand';
import type { Message, LogEntry, Channel, EvalResult, ReadStatus, ReadReceiptMode } from '@tms/shared';

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

  // WhatsApp state
  messageReadStates: Record<string, ReadStatus>;
  messageReactions: Record<string, { emoji: string; fromUser: boolean }[]>;
  replyingTo: Message | null;
  typingIndicator: { active: boolean; role: 'user' | 'bot' } | null;
  readReceiptMode: ReadReceiptMode;

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

  // WhatsApp state
  messageReadStates: {},
  messageReactions: {},
  replyingTo: null,
  typingIndicator: null,
  readReceiptMode: 'on_response',

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
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

  setMode: (mode) => set({ mode }),
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
