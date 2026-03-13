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
  // Bot deliberately chose not to respond
  silence?: boolean;
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
  /** Per-system cost breakdown (Tier 4.6) */
  costBreakdown?: CostBreakdown;
}

export interface BotEndpointMetrics {
  cost?: number;
  cachedTokens?: number;
  uncachedTokens?: number;
  latencyMs?: number;
  /** Anthropic prompt cache: tokens written to cache this turn */
  cacheCreationInputTokens?: number;
  /** Anthropic prompt cache: tokens read from cache this turn */
  cacheReadInputTokens?: number;
}

export interface BotEndpointSummary {
  totalCost?: number;
  averageLatencyMs?: number;
  totalCachedTokens?: number;
  totalUncachedTokens?: number;
  /** Anthropic prompt cache: total tokens written to cache */
  totalCacheCreationInputTokens?: number;
  /** Anthropic prompt cache: total tokens read from cache */
  totalCacheReadInputTokens?: number;
  /** Prompt cache hit rate (0-1): cacheRead / (cacheRead + cacheCreation) */
  cacheHitRate?: number;
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

// --- Prior session context for cross-session continuity testing (Tier 4.4) ---

export interface PriorSessionMessage {
  role: MessageRole;
  content: string;
}

export interface PriorSession {
  /** Pre-seeded conversation history from a prior session */
  history?: PriorSessionMessage[];
  /** Coach notes from a prior session */
  coachNotes?: string;
  /** Reference to a fixture file (for integration with test-accounts infrastructure) */
  fixtureRef?: string;
  /** Things the trainer should already know — user bot will NOT mention these */
  knownContext?: string[];
}

// --- Phase definition for onboarding/handoff testing (Tier 4.5) ---

export interface EvalPhase {
  /** Turn limit for this phase (required) */
  turnLimit: number;
  /** Override userBot goal/persona for this phase */
  userBot?: {
    goal?: string;
    persona?: string;
  };
  /** Phase-specific requirements evaluated by the judge */
  requirements?: string[];
}

// --- Cost breakdown for per-system cost tracking (Tier 4.6) ---

export interface CostBreakdown {
  userBot?: number;
  botEndpoint?: number;
  judge?: number;
  total: number;
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
  judge?: {
    instructions?: string;
  };
  extends?: string;
  /** Global requirement sets to include (Tier 4.1) */
  globals?: string | string[];
  /** Whether silence is expected from the bot in this eval (Tier 4.2) */
  silenceExpected?: boolean;
  /** Prior session context for cross-session continuity testing (Tier 4.4) */
  priorSession?: PriorSession;
  /** Multi-phase conversation support for onboarding/handoff testing (Tier 4.5) */
  phases?: EvalPhase[];
  /** Maximum cost budget in dollars — eval fails if exceeded (Tier 4.6) */
  costBudget?: number;
  /** Ordered sequence of trigger and message steps (Tiers 3.1, 3.2, 3.3) */
  steps?: EvalStep[];
}

export interface EvalSuite {
  name: string;
  description: string;
  specs: string[];
  /** Maximum cost budget in dollars for the entire suite (Tier 4.6) */
  costBudget?: number;
}

export interface ConfigSnapshot {
  userBotModel?: string;
  judgeModel?: string;
  botEndpoint: string;
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
  configSnapshot?: ConfigSnapshot;
  /** A/B test variant label (Tier 4.3) */
  abLabel?: string;
  /** Per-system cost breakdown (Tier 4.6) */
  costBreakdown?: CostBreakdown;
  /** Whether the eval exceeded its cost budget (Tier 4.6) */
  budgetExceeded?: boolean;
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
  parallel?: boolean;
  comparativeSpec?: string;
  runCount?: number;
  /** A/B test variant label (Tier 4.3) */
  abLabel?: string;
}

// --- A/B test types (Tier 4.3) ---

export interface ABVariantConfig {
  label: string;
  specs: string[];
  /** Override bot endpoint for this variant */
  botEndpoint?: string;
  /** Override bot headers for this variant */
  botHeaders?: Record<string, string>;
}

export interface ABRequirementDiff {
  description: string;
  variantAPassRate: number;
  variantBPassRate: number;
  delta: number;
}

export interface ABTestReport {
  variantA: {
    label: string;
    batchId: string;
    passRate: number;
    totalRuns: number;
    totalCost?: number;
  };
  variantB: {
    label: string;
    batchId: string;
    passRate: number;
    totalRuns: number;
    totalCost?: number;
  };
  passRateDelta: number;
  requirementDiffs: ABRequirementDiff[];
  tokenUsageDelta: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costDelta?: number;
}

export interface ComparativeAggregate {
  specName: string;
  totalRuns: number;
  passed: number;
  failed: number;
  needsReview: number;
  passRate: number;
  requirementPassRates: Array<{
    description: string;
    passed: number;
    total: number;
    rate: number;
  }>;
}

export type Trend = 'improving' | 'stable' | 'declining';

export interface SpecHistory {
  specName: string;
  results: Array<{
    id: string;
    classification?: Classification;
    completedAt?: string;
  }>;
  passRate: number;
  recentPassRate: number;
  previousPassRate: number;
  regression: boolean;
  trend: Trend;
}

export interface JudgeConfig {
  model: string;
}

/** Message buffering config — simulates InboundRouter aggregation (Tier 7.1) */
export interface MessageBufferingConfig {
  /** Enable message buffering */
  enabled: boolean;
  /** Initial buffer timeout in milliseconds (default 2000) */
  initialTimeoutMs?: number;
  /** Timeout growth multiplier per message (default 1.25) */
  growthFactor?: number;
  /** Maximum timeout in milliseconds (default 8000) */
  maxTimeoutMs?: number;
}

export interface TmsConfig {
  bot: {
    endpoint: string;
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
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
    maxConcurrency?: number;
    maxConcurrentEvals?: number;
  };
  whatsapp?: WhatsAppEvalConfig;
  pricing?: Record<string, { input: number; output: number }>;
  /** Message buffering — simulates InboundRouter aggregation (Tier 7.1) */
  messageBuffering?: MessageBufferingConfig;
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

// --- Trigger types (Tiers 2.3, 3.1, 3.2, 3.3) ---

export type TriggerType = 'sub_agent' | 'scheduled' | 'system_event' | 'check_in' | 'broadcast';

export interface TriggerMetadata {
  // sub_agent fields
  taskType?: string;
  resultSummary?: string;
  taskId?: string;
  needsResponse?: boolean;
  // scheduled fields
  scheduleId?: string;
  scheduleType?: string;
  scheduledFor?: string;
  // system_event fields
  eventType?: string;
  eventData?: Record<string, unknown>;
  // check_in fields
  checkInId?: string;
  event?: string;
  scheduledAt?: string;
  // broadcast fields
  broadcastId?: string;
  adminId?: string;
}

export interface TriggerPayload {
  type: TriggerType;
  userId: string;
  message: string;
  timestamp: string;
  metadata: TriggerMetadata;
}

/** A trigger step in an eval spec's steps array */
export interface TriggerStep {
  trigger: {
    type: TriggerType;
    message: string;
    metadata?: TriggerMetadata;
  };
}

/** A user message step in an eval spec's steps array */
export interface MessageStep {
  message: true;
}

/** A single step in an eval spec's ordered steps sequence */
export type EvalStep = TriggerStep | MessageStep;

// --- Eval diff types (Tier 6.3) ---

export interface RequirementDiff {
  description: string;
  classificationA?: Classification;
  classificationB?: Classification;
  changed: boolean;
  reasoningA?: string;
  reasoningB?: string;
}

export interface EvalDiffResult {
  specNameA: string;
  specNameB: string;
  idA: string;
  idB: string;
  /** Turn index where transcripts first diverged (-1 if identical length and content) */
  divergencePoint: number;
  requirementDiffs: RequirementDiff[];
  classificationA?: Classification;
  classificationB?: Classification;
  tokenUsageDelta?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costDelta?: number;
  transcriptLengthA: number;
  transcriptLengthB: number;
}

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
  | 'whatsapp:typing_stop'
  | 'trigger:received'
  | 'trigger:response'
  | 'replay:started'
  | 'replay:message'
  | 'replay:completed';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
}
