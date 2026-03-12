import { describe, it, expect } from 'vitest';
import {
  tmsConfigSchema,
  evalSpecSchema,
  evalResultSchema,
  logEntrySchema,
  messageSchema,
} from '../schemas.js';

describe('tmsConfigSchema', () => {
  it('parses valid config', () => {
    const result = tmsConfigSchema.parse({
      bot: { endpoint: 'http://localhost:3000/chat' },
    });
    expect(result.bot.endpoint).toBe('http://localhost:3000/chat');
    expect(result.bot.method).toBe('POST'); // default
  });

  it('rejects missing bot endpoint', () => {
    expect(() => tmsConfigSchema.parse({ bot: {} })).toThrow();
  });

  it('rejects invalid endpoint URL', () => {
    expect(() => tmsConfigSchema.parse({ bot: { endpoint: 'not-a-url' } })).toThrow();
  });

  it('accepts optional fields', () => {
    const result = tmsConfigSchema.parse({
      bot: { endpoint: 'http://localhost:3000/chat', timeoutMs: 5000, retries: 3 },
      server: { port: 8080, maxConcurrency: 10, maxConcurrentEvals: 5 },
      pricing: { 'anthropic:claude-sonnet-4-6': { input: 3.0, output: 15.0 } },
    });
    expect(result.bot.timeoutMs).toBe(5000);
    expect(result.server?.maxConcurrency).toBe(10);
    expect(result.pricing).toBeDefined();
  });
});

describe('evalSpecSchema', () => {
  const validSpec = {
    name: 'test-spec',
    description: 'A test spec',
    channel: 'sms',
    userBot: { goal: 'Test goal', persona: 'Test user' },
    requirements: ['Requirement 1'],
    turnLimit: 5,
  };

  it('parses valid spec', () => {
    const result = evalSpecSchema.parse(validSpec);
    expect(result.name).toBe('test-spec');
  });

  it('rejects missing required fields', () => {
    expect(() => evalSpecSchema.parse({ name: 'test' })).toThrow();
  });

  it('accepts optional judge instructions', () => {
    const result = evalSpecSchema.parse({
      ...validSpec,
      judge: { instructions: 'Be strict' },
    });
    expect(result.judge?.instructions).toBe('Be strict');
  });

  it('accepts optional extends field', () => {
    const result = evalSpecSchema.parse({
      ...validSpec,
      extends: 'base-spec',
    });
    expect(result.extends).toBe('base-spec');
  });
});

describe('evalResultSchema', () => {
  it('parses valid result with configSnapshot', () => {
    const result = evalResultSchema.parse({
      id: 'test-id',
      specName: 'test',
      status: 'completed',
      classification: 'passed',
      requirements: [{ description: 'Req 1', classification: 'passed', reasoning: 'Good' }],
      transcript: [],
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:01:00Z',
      configSnapshot: { botEndpoint: 'http://localhost:3000/chat', userBotModel: 'test-model' },
    });
    expect(result.configSnapshot?.userBotModel).toBe('test-model');
  });
});

describe('logEntrySchema', () => {
  it('parses valid log entry', () => {
    const result = logEntrySchema.parse({
      timestamp: '2024-01-01T00:00:00Z',
      level: 'info',
      source: 'tms',
      message: 'Test log',
    });
    expect(result.level).toBe('info');
  });

  it('rejects invalid level', () => {
    expect(() =>
      logEntrySchema.parse({
        timestamp: '2024-01-01T00:00:00Z',
        level: 'invalid',
        source: 'tms',
        message: 'Test',
      }),
    ).toThrow();
  });
});

describe('messageSchema', () => {
  it('parses valid message', () => {
    const result = messageSchema.parse({
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      channel: 'sms',
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.role).toBe('user');
  });

  it('accepts optional media fields', () => {
    const result = messageSchema.parse({
      id: 'msg-1',
      role: 'bot',
      content: 'Here is an image',
      channel: 'whatsapp',
      timestamp: '2024-01-01T00:00:00Z',
      mediaType: 'image/jpeg',
      mediaUrl: 'http://example.com/img.jpg',
    });
    expect(result.mediaType).toBe('image/jpeg');
  });
});
