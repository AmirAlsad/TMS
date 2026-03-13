import { z } from 'zod';

export const channelSchema = z.enum(['sms', 'whatsapp']);

export const readStatusSchema = z.enum(['sent', 'delivered', 'read']);

export const messageReadStatusSchema = z.object({
  status: readStatusSchema,
  sentAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  readAt: z.string().optional(),
});

export const quotedReplySchema = z.object({
  targetMessageId: z.string(),
  quotedBody: z.string(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'bot']),
  content: z.string(),
  channel: channelSchema,
  timestamp: z.string(),
  quotedReply: quotedReplySchema.optional(),
  mediaType: z.string().optional(),
  mediaUrl: z.string().optional(),
  transcription: z.string().nullable().optional(),
  readStatus: messageReadStatusSchema.optional(),
  silence: z.boolean().optional(),
});

export const logEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  source: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
});

export const tokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const botEndpointMetricsSchema = z.object({
  cost: z.number().nonnegative().optional(),
  cachedTokens: z.number().int().nonnegative().optional(),
  uncachedTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  cacheReadInputTokens: z.number().int().nonnegative().optional(),
});

export const botEndpointSummarySchema = z.object({
  totalCost: z.number().nonnegative().optional(),
  averageLatencyMs: z.number().nonnegative().optional(),
  totalCachedTokens: z.number().int().nonnegative().optional(),
  totalUncachedTokens: z.number().int().nonnegative().optional(),
  totalCacheCreationInputTokens: z.number().int().nonnegative().optional(),
  totalCacheReadInputTokens: z.number().int().nonnegative().optional(),
  cacheHitRate: z.number().min(0).max(1).optional(),
});

// --- Cost breakdown schema (Tier 4.6) ---

export const costBreakdownSchema = z.object({
  userBot: z.number().nonnegative().optional(),
  botEndpoint: z.number().nonnegative().optional(),
  judge: z.number().nonnegative().optional(),
  total: z.number().nonnegative(),
});

export const tokenUsageSummarySchema = z.object({
  userBot: tokenUsageSchema,
  judge: tokenUsageSchema,
  botEndpoint: tokenUsageSchema,
  total: tokenUsageSchema,
  botMetrics: botEndpointSummarySchema.optional(),
  costBreakdown: costBreakdownSchema.optional(),
});

export const readReceiptModeSchema = z.enum(['auto_delay', 'manual', 'on_response']);

export const whatsAppEvalConfigSchema = z.object({
  readReceipts: z
    .object({
      mode: readReceiptModeSchema,
      autoDelayMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
  userBot: z
    .object({
      allowReactions: z.boolean().optional(),
      allowQuotedReplies: z.boolean().optional(),
      allowVoiceNotes: z.boolean().optional(),
      voiceNoteAssets: z.array(z.string()).optional(),
      allowMediaMessages: z.boolean().optional(),
      mediaAssets: z
        .array(
          z.object({
            ref: z.string(),
            mediaType: z.string(),
            mediaUrl: z.string().url(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const EMOJI_REGEX =
  /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(\u200D(\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;

export const emojiSchema = z
  .string()
  .min(1)
  .max(8)
  .refine((val) => EMOJI_REGEX.test(val), { message: 'Must be a valid emoji' });

export const whatsAppReactionSchema = z.object({
  type: z.enum(['reaction', 'reaction_removed']),
  fromUser: z.boolean(),
  targetMessageId: z.string(),
  emoji: emojiSchema,
  timestamp: z.string(),
});

export const whatsAppReadReceiptSchema = z.object({
  type: z.literal('read_receipt'),
  messageId: z.string(),
  readAt: z.string(),
});

export const whatsAppTypingEventSchema = z.object({
  type: z.enum(['typing_start', 'typing_stop']),
  fromUser: z.boolean(),
  timestamp: z.string(),
});

export const userBotActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_message'),
    body: z.string(),
    goalComplete: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('react_to_message'),
    targetMessageId: z.string(),
    emoji: emojiSchema,
  }),
  z.object({
    type: z.literal('remove_reaction'),
    targetMessageId: z.string(),
  }),
  z.object({
    type: z.literal('reply_to_message'),
    targetMessageId: z.string(),
    body: z.string(),
    goalComplete: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('send_voice_note'),
    audioRef: z.string(),
  }),
  z.object({
    type: z.literal('send_media'),
    mediaType: z.string(),
    mediaUrl: z.string(),
    caption: z.string().optional(),
    goalComplete: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('wait'),
  }),
]);

// --- Prior session schema (Tier 4.4) ---

export const priorSessionMessageSchema = z.object({
  role: z.enum(['user', 'bot']),
  content: z.string(),
});

export const priorSessionSchema = z.object({
  history: z.array(priorSessionMessageSchema).optional(),
  coachNotes: z.string().optional(),
  fixtureRef: z.string().optional(),
  knownContext: z.array(z.string()).optional(),
});

// --- Eval phase schema (Tier 4.5) ---

export const evalPhaseSchema = z.object({
  turnLimit: z.number().int().positive(),
  userBot: z
    .object({
      goal: z.string().optional(),
      persona: z.string().optional(),
    })
    .optional(),
  requirements: z.array(z.string()).optional(),
});

// --- Trigger schemas (Tiers 2.3, 3.1, 3.2, 3.3) ---

export const triggerTypeSchema = z.enum([
  'sub_agent',
  'scheduled',
  'system_event',
  'check_in',
  'broadcast',
]);

export const triggerMetadataSchema = z.object({
  taskType: z.string().optional(),
  resultSummary: z.string().optional(),
  taskId: z.string().optional(),
  needsResponse: z.boolean().optional(),
  scheduleId: z.string().optional(),
  scheduleType: z.string().optional(),
  scheduledFor: z.string().optional(),
  eventType: z.string().optional(),
  eventData: z.record(z.unknown()).optional(),
  checkInId: z.string().optional(),
  event: z.string().optional(),
  scheduledAt: z.string().optional(),
  broadcastId: z.string().optional(),
  adminId: z.string().optional(),
});

export const triggerPayloadSchema = z.object({
  type: triggerTypeSchema,
  userId: z.string(),
  message: z.string(),
  timestamp: z.string(),
  metadata: triggerMetadataSchema,
});

export const triggerStepSchema = z.object({
  trigger: z.object({
    type: triggerTypeSchema,
    message: z.string(),
    metadata: triggerMetadataSchema.optional(),
  }),
});

export const messageStepSchema = z.object({
  message: z.literal(true),
});

export const evalStepSchema = z.union([triggerStepSchema, messageStepSchema]);

export const evalSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  channel: channelSchema,
  userBot: z.object({
    goal: z.string(),
    persona: z.string(),
  }),
  requirements: z.array(z.string()),
  turnLimit: z.number().int().positive(),
  hooks: z
    .object({
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
  whatsapp: whatsAppEvalConfigSchema.optional(),
  judge: z
    .object({
      instructions: z.string().optional(),
    })
    .optional(),
  extends: z.string().optional(),
  silenceExpected: z.boolean().optional(),
  // Tier 4.1: Global requirement sets
  globals: z.union([z.string(), z.array(z.string())]).optional(),
  // Tier 4.4: Cross-session continuity
  priorSession: priorSessionSchema.optional(),
  // Tier 4.5: Multi-phase conversations
  phases: z.array(evalPhaseSchema).optional(),
  // Tier 4.6: Cost budget
  costBudget: z.number().nonnegative().optional(),
  // Tiers 3.1, 3.2, 3.3: Ordered trigger/message steps
  steps: z.array(evalStepSchema).optional(),
});

export const judgeConfigSchema = z.object({
  model: z.string(),
});

export const evalSuiteSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  specs: z.array(z.string().min(1)).min(1),
  costBudget: z.number().nonnegative().optional(),
});

export const configSnapshotSchema = z.object({
  userBotModel: z.string().optional(),
  judgeModel: z.string().optional(),
  botEndpoint: z.string(),
});

export const evalResultSchema = z.object({
  id: z.string(),
  specName: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  classification: z.enum(['passed', 'needs_review', 'failed']).optional(),
  requirements: z.array(
    z.object({
      description: z.string(),
      classification: z.enum(['passed', 'needs_review', 'failed']).optional(),
      reasoning: z.string().optional(),
    }),
  ),
  transcript: z.array(messageSchema),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  tokenUsage: tokenUsageSummarySchema.optional(),
  batchId: z.string().optional(),
  configSnapshot: configSnapshotSchema.optional(),
  abLabel: z.string().optional(),
  costBreakdown: costBreakdownSchema.optional(),
  budgetExceeded: z.boolean().optional(),
});

export const batchRunSchema = z.object({
  id: z.string(),
  label: z.string(),
  suiteName: z.string().optional(),
  specNames: z.array(z.string()),
  specIds: z.array(z.string()),
  status: z.enum(['running', 'completed', 'failed']),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  parallel: z.boolean().optional(),
  comparativeSpec: z.string().optional(),
  runCount: z.number().int().positive().optional(),
  abLabel: z.string().optional(),
});

export const tmsConfigSchema = z.object({
  bot: z.object({
    endpoint: z.string().url(),
    method: z.string().default('POST'),
    headers: z.record(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
    retries: z.number().int().nonnegative().optional(),
  }),
  userBot: z
    .object({
      model: z.string(),
      systemPrompt: z.string().optional(),
    })
    .optional(),
  judge: judgeConfigSchema.optional(),
  logs: z
    .object({
      enabled: z.boolean().default(true),
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    })
    .optional(),
  server: z
    .object({
      port: z.number().int().default(4000),
      maxConcurrency: z.number().int().positive().optional(),
      maxConcurrentEvals: z.number().int().positive().optional(),
    })
    .optional(),
  whatsapp: whatsAppEvalConfigSchema.optional(),
  pricing: z
    .record(z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() }))
    .optional(),
  messageBuffering: z
    .object({
      enabled: z.boolean(),
      initialTimeoutMs: z.number().int().nonnegative().optional(),
      growthFactor: z.number().positive().optional(),
      maxTimeoutMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
