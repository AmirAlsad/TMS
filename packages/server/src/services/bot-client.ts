import type { Message, TmsConfig, TokenUsage, BotEndpointMetrics } from '@tms/shared';

export interface BotResponse {
  text: string;
  usage?: TokenUsage;
  metrics?: BotEndpointMetrics;
}

function extractUsage(data: unknown): TokenUsage | undefined {
  if (data !== null && typeof data === 'object' && 'usage' in data) {
    const u = (data as Record<string, unknown>).usage;
    if (u !== null && typeof u === 'object') {
      const usage = u as Record<string, unknown>;
      if (
        typeof usage.promptTokens === 'number' &&
        typeof usage.completionTokens === 'number' &&
        typeof usage.totalTokens === 'number'
      ) {
        return {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        };
      }
    }
  }
  return undefined;
}

function extractMetrics(data: unknown): BotEndpointMetrics | undefined {
  if (data === null || typeof data !== 'object' || !('metrics' in data)) return undefined;
  const m = (data as Record<string, unknown>).metrics;
  if (m === null || typeof m !== 'object') return undefined;

  const raw = m as Record<string, unknown>;
  const metrics: BotEndpointMetrics = {};

  if (typeof raw.cost === 'number') metrics.cost = raw.cost;
  if (typeof raw.cachedTokens === 'number') metrics.cachedTokens = raw.cachedTokens;
  if (typeof raw.uncachedTokens === 'number') metrics.uncachedTokens = raw.uncachedTokens;
  if (typeof raw.latencyMs === 'number') metrics.latencyMs = raw.latencyMs;

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

export async function sendToBot(config: TmsConfig, message: Message): Promise<BotResponse> {
  const { endpoint, method = 'POST', headers = {} } = config.bot;

  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      message: message.content,
      channel: message.channel,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bot returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  // Support common response shapes
  let text: string;
  if (typeof data === 'string') {
    text = data;
  } else if (typeof data.message === 'string') {
    text = data.message;
  } else if (typeof data.response === 'string') {
    text = data.response;
  } else if (typeof data.content === 'string') {
    text = data.content;
  } else if (typeof data.text === 'string') {
    text = data.text;
  } else {
    throw new Error('Could not extract message from bot response');
  }

  return { text, usage: extractUsage(data), metrics: extractMetrics(data) };
}
