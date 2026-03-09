import {
  createProviderRegistry,
  generateText,
  stepCountIs,
  type ModelMessage,
  type TextPart,
  type ImagePart,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { BotConfig } from './config.js';
import { log } from './logger.js';
import { AppointmentStore } from './store.js';
import { createTools, createReactionTool } from './tools.js';
import { buildMediaContent } from './media-processor.js';
import { createSendMediaTool, consumePendingMedia } from './media-tools.js';

const registry = createProviderRegistry({ anthropic, openai });

/** Per-million-token pricing for cost estimation. */
const MODEL_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'anthropic:claude-sonnet-4-6': { input: 3, cachedInput: 0.3, output: 15 },
  'anthropic:claude-haiku-4-5': { input: 0.8, cachedInput: 0.08, output: 4 },
  'anthropic:claude-opus-4-6': { input: 15, cachedInput: 1.5, output: 75 },
};

const history = new Map<string, ModelMessage[]>();

const store = new AppointmentStore();
const baseTools = createTools(store);

export interface ChatOptions {
  messageId?: string;
  quotedReply?: { targetMessageId: string; quotedBody: string };
  callbackUrl?: string;
  mediaType?: string;
  mediaUrl?: string;
}

export function initLlm(_config: BotConfig): void {
  // No client initialization needed with AI SDK — uses env vars automatically
}

export interface ToolCallInfo {
  toolName: string;
  input: unknown;
}

export interface ToolResultInfo {
  toolName: string;
  result: unknown;
}

export interface ChatResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  metrics: {
    cachedTokens?: number;
    uncachedTokens?: number;
    cost?: number;
    latencyMs: number;
  };
  structuredData?: Record<string, unknown>;
  toolCalls: ToolCallInfo[];
  toolResults: ToolResultInfo[];
  mediaType?: string;
  mediaUrl?: string;
}

export async function chat(
  config: BotConfig,
  message: string,
  channel: string,
  options?: ChatOptions,
): Promise<ChatResult> {
  const channelHistory = history.get(channel) ?? [];

  // Build user content — multimodal when media is present
  let userContent: string | Array<TextPart | ImagePart>;

  if (options?.mediaType && options?.mediaUrl) {
    const metaParts: Array<TextPart | ImagePart> = [];
    if (options.messageId) {
      metaParts.push({ type: 'text', text: `[msg:${options.messageId}]` });
    }
    if (options.quotedReply) {
      metaParts.push({
        type: 'text',
        text: `[Replying to: "${options.quotedReply.quotedBody}"]`,
      });
    }
    const mediaContent = await buildMediaContent(options.mediaType, options.mediaUrl, message);
    userContent = [...metaParts, ...mediaContent];
  } else {
    // Original string path — untouched
    const parts: string[] = [];
    if (options?.messageId) {
      parts.push(`[msg:${options.messageId}]`);
    }
    if (options?.quotedReply) {
      parts.push(`[Replying to: "${options.quotedReply.quotedBody}"]`);
    }
    parts.push(message);
    userContent = parts.join('\n');
  }

  channelHistory.push({ role: 'user', content: userContent });

  // Merge optional tools: reaction tool when callbackUrl is present, send_media for WhatsApp
  const tools = {
    ...baseTools,
    ...(options?.callbackUrl ? createReactionTool(options.callbackUrl) : {}),
    ...(options?.callbackUrl ? createSendMediaTool(channel) : {}),
  };

  const isAnthropic = config.model.startsWith('anthropic:');

  const system: string | import('ai').SystemModelMessage = isAnthropic
    ? {
        role: 'system' as const,
        content: config.systemPrompt,
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      }
    : config.systemPrompt;

  const ch = channel;
  const startTime = performance.now();
  const result = await generateText({
    model: registry.languageModel(
      config.model as Parameters<typeof registry.languageModel>[0],
    ),
    maxOutputTokens: config.maxTokens,
    system,
    messages: channelHistory,
    tools,
    stopWhen: stepCountIs(config.maxSteps),
    onStepFinish({ toolCalls, toolResults }) {
      for (const tc of toolCalls) {
        log('info', `Tool call: ${tc.toolName}`, { channel: ch, toolName: tc.toolName, input: tc.input as Record<string, unknown> });
      }
      for (const tr of toolResults) {
        log('info', `Tool result: ${tr.toolName}`, { channel: ch, toolName: tr.toolName, result: tr.output as Record<string, unknown> });
      }
    },
  });
  const latencyMs = Math.round(performance.now() - startTime);

  const text = result.text;

  // Append all response messages (including tool call/result steps) to preserve full context
  channelHistory.push(...result.response.messages);
  history.set(channel, channelHistory);

  const cachedTokens = result.usage.inputTokenDetails?.cacheReadTokens;
  const uncachedTokens = result.usage.inputTokenDetails?.noCacheTokens;

  // Calculate estimated cost
  const pricing = MODEL_PRICING[config.model];
  let cost: number | undefined;
  if (pricing) {
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const cached = cachedTokens ?? 0;
    const uncached = inputTokens - cached;
    cost =
      (uncached * pricing.input + cached * pricing.cachedInput + outputTokens * pricing.output) /
      1_000_000;
  }

  // Extract structured data from tool results (last booking/reschedule result)
  let structuredData: Record<string, unknown> | undefined;
  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      if (
        toolResult.toolName === 'book_appointment' ||
        toolResult.toolName === 'reschedule_appointment'
      ) {
        const res = toolResult.output as Record<string, unknown>;
        if ('appointment' in res) {
          structuredData = res.appointment as Record<string, unknown>;
        } else if ('newAppointment' in res) {
          structuredData = res.newAppointment as Record<string, unknown>;
        }
      }
    }
  }

  const toolCalls: ToolCallInfo[] = result.steps.flatMap((step) =>
    step.toolCalls.map((tc) => ({ toolName: tc.toolName, input: tc.input })),
  );
  const toolResultInfos: ToolResultInfo[] = result.steps.flatMap((step) =>
    step.toolResults.map((tr) => ({ toolName: tr.toolName, result: tr.output })),
  );

  // Check if the bot used send_media tool during this turn
  const pendingMedia = consumePendingMedia(channel);

  // If the bot used send_media with a caption but produced no text, use the caption as text
  const responseText =
    !text && pendingMedia?.caption ? pendingMedia.caption : text;

  return {
    text: responseText,
    usage: {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      totalTokens:
        result.usage.totalTokens ??
        (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
    },
    metrics: {
      ...(cachedTokens != null ? { cachedTokens } : {}),
      ...(uncachedTokens != null ? { uncachedTokens } : {}),
      ...(cost != null ? { cost } : {}),
      latencyMs,
    },
    toolCalls,
    toolResults: toolResultInfos,
    ...(structuredData ? { structuredData } : {}),
    ...(pendingMedia ? { mediaType: pendingMedia.mediaType, mediaUrl: pendingMedia.mediaUrl } : {}),
  };
}

export function clearHistory(channel?: string): void {
  if (channel) {
    history.delete(channel);
  } else {
    history.clear();
  }
}
