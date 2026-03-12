import type {
  Message,
  TmsConfig,
  TokenUsage,
  BotEndpointMetrics,
  ToolCallInfo,
  ToolResultInfo,
  WhatsAppReaction,
} from '@tms/shared';

export interface BotResponse {
  text: string;
  usage?: TokenUsage;
  metrics?: BotEndpointMetrics;
  toolCalls?: ToolCallInfo[];
  toolResults?: ToolResultInfo[];
  mediaType?: string;
  mediaUrl?: string;
  transcription?: string;
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

export function getCallbackBaseUrl(config: TmsConfig): string {
  const port = config.server?.port ?? 4000;
  return `http://localhost:${port}`;
}

export async function sendToBot(
  config: TmsConfig,
  message: Message,
  callbackUrl?: string,
): Promise<BotResponse> {
  const { endpoint, method = 'POST', headers = {} } = config.bot;
  const timeoutMs = config.bot.timeoutMs ?? 60000;
  const maxRetries = config.bot.retries ?? 2;

  const body: Record<string, unknown> = {
    message: message.content,
    messageId: message.id,
    channel: message.channel,
  };

  if (message.quotedReply) {
    body.quotedReply = message.quotedReply;
  }

  if (message.mediaType) {
    body.mediaType = message.mediaType;
    body.mediaUrl = message.mediaUrl;
  }

  if (callbackUrl) {
    body.callbackUrl = callbackUrl;
  }

  const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
  const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 404]);

  let lastError: Error | undefined;
  let response: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        break;
      }

      // Don't retry client errors
      if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
        throw new Error(`Bot returned ${response.status}: ${await response.text()}`);
      }

      // Retry on retryable status codes
      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        lastError = new Error(`Bot returned ${response.status}: ${await response.text()}`);
        if (attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt);
          console.warn(
            `[tms] Bot returned ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw lastError;
      }

      // Non-retryable, non-client error
      throw new Error(`Bot returned ${response.status}: ${await response.text()}`);
    } catch (err) {
      // Network errors (TypeError) and timeouts are retryable
      if (err instanceof TypeError || (err instanceof DOMException && err.name === 'TimeoutError')) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt);
          console.warn(
            `[tms] Bot request failed (${lastError.message}), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
      throw err;
    }
  }

  if (!response || !response.ok) {
    throw lastError ?? new Error('Bot request failed after retries');
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
    text = '';
  }

  const toolCalls = Array.isArray(data.toolCalls) ? (data.toolCalls as ToolCallInfo[]) : undefined;
  const toolResults = Array.isArray(data.toolResults)
    ? (data.toolResults as ToolResultInfo[])
    : undefined;

  const mediaType = typeof data.mediaType === 'string' ? data.mediaType : undefined;
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined;
  const transcription = typeof data.transcription === 'string' ? data.transcription : undefined;

  if (!text && !mediaUrl) {
    throw new Error('Could not extract message from bot response');
  }

  return {
    text,
    usage: extractUsage(data),
    metrics: extractMetrics(data),
    toolCalls,
    toolResults,
    mediaType,
    mediaUrl,
    transcription,
  };
}

/**
 * Fire a status callback to the bot endpoint, mimicking Twilio's StatusCallback webhook.
 * This notifies the bot that a message it sent has been read (or delivered).
 * The bot endpoint can ignore this if it doesn't care about message status.
 */
export async function sendStatusCallback(
  config: TmsConfig,
  messageId: string,
  status: 'delivered' | 'read',
): Promise<void> {
  const { endpoint, headers = {} } = config.bot;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        type: 'status_callback',
        channel: 'whatsapp',
        messageId,
        messageStatus: status,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // Status callbacks are fire-and-forget; don't break the flow if the endpoint rejects them
    console.warn('[tms] Status callback failed:', {
      endpoint,
      messageId,
      status,
      error: (err as Error).message ?? String(err),
    });
  }
}

/**
 * Fire a reaction callback to the bot endpoint, mimicking Twilio's inbound webhook
 * for WhatsApp reactions. Returns a BotResponse if the bot chose to reply,
 * or null if the bot stayed silent or the request failed.
 */
export async function sendReactionCallback(
  config: TmsConfig,
  reaction: WhatsAppReaction,
): Promise<BotResponse | null> {
  const { endpoint, headers = {} } = config.bot;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        type: 'reaction_callback',
        channel: 'whatsapp',
        targetMessageId: reaction.targetMessageId,
        emoji: reaction.emoji,
        reactionType: reaction.type,
        fromUser: reaction.fromUser,
        timestamp: reaction.timestamp,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();

    // Bot indicated silence
    if (data.silent) return null;

    // Try to extract a text response
    let text: string | undefined;
    if (typeof data.response === 'string') text = data.response;
    else if (typeof data.message === 'string') text = data.message;
    else if (typeof data.content === 'string') text = data.content;
    else if (typeof data.text === 'string') text = data.text;

    const mediaType = typeof data.mediaType === 'string' ? data.mediaType : undefined;
    const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined;

    if (!text && !mediaUrl) return null;

    const toolCalls = Array.isArray(data.toolCalls)
      ? (data.toolCalls as ToolCallInfo[])
      : undefined;
    const toolResults = Array.isArray(data.toolResults)
      ? (data.toolResults as ToolResultInfo[])
      : undefined;

    return {
      text: text ?? '',
      usage: extractUsage(data),
      metrics: extractMetrics(data),
      toolCalls,
      toolResults,
      mediaType,
      mediaUrl,
    };
  } catch (err) {
    console.warn('[tms] Reaction callback failed:', {
      endpoint,
      emoji: reaction.emoji,
      targetMessageId: reaction.targetMessageId,
      error: (err as Error).message ?? String(err),
    });
    return null;
  }
}
