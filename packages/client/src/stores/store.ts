import { create } from 'zustand';
import type { Message, LogEntry, Channel, EvalResult } from '@tms/shared';

export type AppMode = 'playground' | 'automated';

export interface EvalStatus {
  id: string;
  specName: string;
  status: 'running' | 'completed' | 'failed';
  currentTurn: number;
  totalTurns: number;
}

interface TmsStore {
  messages: Message[];
  logs: LogEntry[];
  channel: Channel;
  botEndpoint: string;
  showConfig: boolean;

  // Eval state
  mode: AppMode;
  evalSpecs: string[];
  currentEval: EvalStatus | null;
  evalResults: EvalResult[];

  addMessage: (message: Message) => void;
  addLog: (log: LogEntry) => void;
  setChannel: (channel: Channel) => void;
  setBotEndpoint: (endpoint: string) => void;
  toggleConfig: () => void;
  clearMessages: () => void;
  clearLogs: () => void;

  // Eval actions
  setMode: (mode: AppMode) => void;
  setEvalSpecs: (specs: string[]) => void;
  startEval: (eval_: EvalStatus) => void;
  updateEvalStatus: (update: Partial<EvalStatus> & { id: string }) => void;
  setEvalResult: (result: EvalResult) => void;
  setEvalResults: (results: EvalResult[]) => void;
  clearEval: () => void;
}

export const useStore = create<TmsStore>((set) => ({
  messages: [],
  logs: [],
  channel: 'sms',
  botEndpoint: 'http://localhost:3000/chat',
  showConfig: false,

  // Eval state
  mode: 'playground',
  evalSpecs: [],
  currentEval: null,
  evalResults: [],

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  addLog: (log) => set((s) => ({ logs: [...s.logs, log] })),
  setChannel: (channel) => set({ channel }),
  setBotEndpoint: (endpoint) => set({ botEndpoint: endpoint }),
  toggleConfig: () => set((s) => ({ showConfig: !s.showConfig })),
  clearMessages: () => set({ messages: [] }),
  clearLogs: () => set({ logs: [] }),

  // Eval actions
  setMode: (mode) => set({ mode }),
  setEvalSpecs: (specs) => set({ evalSpecs: specs }),
  startEval: (eval_) => set({ currentEval: eval_, messages: [] }),
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
}));
