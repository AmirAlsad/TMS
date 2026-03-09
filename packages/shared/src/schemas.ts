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
});

export const botEndpointSummarySchema = z.object({
  totalCost: z.number().nonnegative().optional(),
  averageLatencyMs: z.number().nonnegative().optional(),
  totalCachedTokens: z.number().int().nonnegative().optional(),
  totalUncachedTokens: z.number().int().nonnegative().optional(),
});

export const tokenUsageSummarySchema = z.object({
  userBot: tokenUsageSchema,
  judge: tokenUsageSchema,
  botEndpoint: tokenUsageSchema,
  total: tokenUsageSchema,
  botMetrics: botEndpointSummarySchema.optional(),
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
});

export const judgeConfigSchema = z.object({
  model: z.string(),
});

export const evalSuiteSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  specs: z.array(z.string().min(1)).min(1),
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
});

export const tmsConfigSchema = z.object({
  bot: z.object({
    endpoint: z.string().url(),
    method: z.string().default('POST'),
    headers: z.record(z.string()).optional(),
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
    })
    .optional(),
  server: z
    .object({
      port: z.number().int().default(4000),
    })
    .optional(),
  whatsapp: whatsAppEvalConfigSchema.optional(),
});
