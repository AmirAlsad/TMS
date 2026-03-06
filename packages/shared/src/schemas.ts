import { z } from 'zod';

export const channelSchema = z.enum(['sms', 'whatsapp']);

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'bot']),
  content: z.string(),
  channel: channelSchema,
  timestamp: z.string(),
});

export const logEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  source: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
});

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
});

export const judgeConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().optional(),
  apiKey: z.string().optional(),
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
});

export const tmsConfigSchema = z.object({
  bot: z.object({
    endpoint: z.string().url(),
    method: z.string().default('POST'),
    headers: z.record(z.string()).optional(),
  }),
  userBot: z
    .object({
      provider: z.enum(['anthropic', 'openai']),
      model: z.string().optional(),
      apiKey: z.string().optional(),
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
});
