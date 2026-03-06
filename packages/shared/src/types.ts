export type Channel = 'sms' | 'whatsapp';

export type MessageRole = 'user' | 'bot';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  channel: Channel;
  timestamp: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

export type Classification = 'passed' | 'needs_review' | 'failed';

export interface EvalRequirement {
  description: string;
  classification?: Classification;
  reasoning?: string;
}

export interface EvalSpec {
  name: string;
  description: string;
  channel: Channel;
  userBot: {
    goal: string;
    persona: string;
  };
  requirements: string[];
  turnLimit: number;
  hooks?: {
    before?: string;
    after?: string;
  };
}

export interface EvalResult {
  id: string;
  specName: string;
  status: 'running' | 'completed' | 'failed';
  classification?: Classification;
  requirements: EvalRequirement[];
  transcript: Message[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface JudgeConfig {
  model: string;
}

export interface TmsConfig {
  bot: {
    endpoint: string;
    method?: string;
    headers?: Record<string, string>;
  };
  userBot?: {
    model: string;
    systemPrompt?: string;
  };
  judge?: JudgeConfig;
  logs?: {
    enabled: boolean;
  };
  server?: {
    port: number;
  };
}

export interface ConversationResult {
  transcript: Message[];
  turnCount: number;
  goalCompleted: boolean;
  error?: string;
}

export interface HookResult {
  stdout: string;
  stderr: string;
}

// WebSocket message types
export type WsMessageType =
  | 'user:message'
  | 'bot:message'
  | 'log:entry'
  | 'eval:started'
  | 'eval:status'
  | 'eval:result';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
}
