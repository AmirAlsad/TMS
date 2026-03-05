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

export const tmsConfigSchema = z.object({
  bot: z.object({
    endpoint: z.string().url(),
    method: z.string().default('POST'),
    headers: z.record(z.string()).optional(),
  }),
  userBot: z
    .object({
      provider: z.enum(['builtin', 'custom']),
      model: z.string().optional(),
      apiKey: z.string().optional(),
      endpoint: z.string().url().optional(),
    })
    .optional(),
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
