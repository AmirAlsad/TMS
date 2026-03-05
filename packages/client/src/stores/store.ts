import { create } from 'zustand';
import type { Message, LogEntry, Channel } from '@tms/shared';

interface TmsStore {
  messages: Message[];
  logs: LogEntry[];
  channel: Channel;
  botEndpoint: string;
  showConfig: boolean;

  addMessage: (message: Message) => void;
  addLog: (log: LogEntry) => void;
  setChannel: (channel: Channel) => void;
  setBotEndpoint: (endpoint: string) => void;
  toggleConfig: () => void;
  clearMessages: () => void;
  clearLogs: () => void;
}

export const useStore = create<TmsStore>((set) => ({
  messages: [],
  logs: [],
  channel: 'sms',
  botEndpoint: 'http://localhost:3000/chat',
  showConfig: false,

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  addLog: (log) => set((s) => ({ logs: [...s.logs, log] })),
  setChannel: (channel) => set({ channel }),
  setBotEndpoint: (endpoint) => set({ botEndpoint: endpoint }),
  toggleConfig: () => set((s) => ({ showConfig: !s.showConfig })),
  clearMessages: () => set({ messages: [] }),
  clearLogs: () => set({ logs: [] }),
}));
