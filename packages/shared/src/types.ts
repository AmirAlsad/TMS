export type Channel = 'sms' | 'whatsapp';

export type MessageRole = 'user' | 'bot';

export interface ToolCallInfo {
  toolName: string;
  input: unknown;
}

export interface ToolResultInfo {
  toolName: string;
  result: unknown;
}

export type ReadStatus = 'sent' | 'delivered' | 'read';

export interface MessageReadStatus {
  status: ReadStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface QuotedReply {
  targetMessageId: string;
  quotedBody: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  channel: Channel;
  timestamp: string;
  toolCalls?: ToolCallInfo[];
  toolResults?: ToolResultInfo[];
  // WhatsApp-specific fields
  quotedReply?: QuotedReply;
  mediaType?: string;
  mediaUrl?: string;
  transcription?: string | null;
  readStatus?: MessageReadStatus;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenUsageSummary {
  userBot: TokenUsage;
  judge: TokenUsage;
  botEndpoint: TokenUsage;
  total: TokenUsage;
  botMetrics?: BotEndpointSummary;
}

export interface BotEndpointMetrics {
  cost?: number;
  cachedTokens?: number;
  uncachedTokens?: number;
  latencyMs?: number;
}

export interface BotEndpointSummary {
  totalCost?: number;
  averageLatencyMs?: number;
  totalCachedTokens?: number;
  totalUncachedTokens?: number;
}

export interface TurnUsage {
  turn: number;
  userBot?: TokenUsage;
  botEndpoint?: TokenUsage;
  botMetrics?: BotEndpointMetrics;
}

export type Classification = 'passed' | 'needs_review' | 'failed';

export interface EvalRequirement {
  description: string;
  classification?: Classification;
  reasoning?: string;
}

export type ReadReceiptMode = 'auto_delay' | 'manual' | 'on_response';

export interface WhatsAppEvalConfig {
  readReceipts?: {
    mode: ReadReceiptMode;
    autoDelayMs?: number;
  };
  userBot?: {
    allowReactions?: boolean;
    allowQuotedReplies?: boolean;
    allowVoiceNotes?: boolean;
    voiceNoteAssets?: string[];
    allowMediaMessages?: boolean;
    mediaAssets?: Array<{ ref: string; mediaType: string; mediaUrl: string }>;
  };
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
  whatsapp?: WhatsAppEvalConfig;
}

export interface EvalSuite {
  name: string;
  description: string;
  specs: string[];
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
  tokenUsage?: TokenUsageSummary;
  batchId?: string;
}

export type BatchRunStatus = 'running' | 'completed' | 'failed';

export interface BatchRun {
  id: string;
  label: string;
  suiteName?: string;
  specNames: string[];
  specIds: string[];
  status: BatchRunStatus;
  startedAt: string;
  completedAt?: string;
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
    level?: LogLevel;
  };
  server?: {
    port: number;
  };
  whatsapp?: WhatsAppEvalConfig;
}

export interface ConversationResult {
  transcript: Message[];
  turnCount: number;
  goalCompleted: boolean;
  error?: string;
  turnUsages: TurnUsage[];
  userBotTotal: TokenUsage;
  events?: WhatsAppEvent[];
}

export interface HookResult {
  stdout: string;
  stderr: string;
}

// WhatsApp event types
export interface WhatsAppReaction {
  type: 'reaction' | 'reaction_removed';
  fromUser: boolean;
  targetMessageId: string;
  emoji: string;
  timestamp: string;
}

export interface WhatsAppReadReceipt {
  type: 'read_receipt';
  messageId: string;
  readAt: string;
}

export interface WhatsAppTypingEvent {
  type: 'typing_start' | 'typing_stop';
  fromUser: boolean;
  timestamp: string;
}

export type UserBotAction =
  | { type: 'send_message'; body: string; goalComplete?: boolean }
  | { type: 'react_to_message'; targetMessageId: string; emoji: string }
  | { type: 'remove_reaction'; targetMessageId: string }
  | { type: 'reply_to_message'; targetMessageId: string; body: string; goalComplete?: boolean }
  | { type: 'send_voice_note'; audioRef: string }
  | { type: 'send_media'; mediaType: string; mediaUrl: string; caption?: string; goalComplete?: boolean }
  | { type: 'wait' };

// Union of all WhatsApp events for judge input
export type WhatsAppEvent = WhatsAppReaction | WhatsAppReadReceipt | WhatsAppTypingEvent;

// WebSocket message types
export type WsMessageType =
  | 'user:message'
  | 'bot:message'
  | 'log:entry'
  | 'eval:started'
  | 'eval:status'
  | 'eval:result'
  | 'batch:started'
  | 'batch:completed'
  | 'whatsapp:reaction'
  | 'whatsapp:reaction_removed'
  | 'whatsapp:read_receipt'
  | 'whatsapp:typing_start'
  | 'whatsapp:typing_stop';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
}
