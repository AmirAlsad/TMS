import { createProviderRegistry, generateText, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { BotConfig } from './config.js';
import { AppointmentStore } from './store.js';
import { createTools } from './tools.js';

const registry = createProviderRegistry({ anthropic, openai });

const history = new Map<string, ModelMessage[]>();

const store = new AppointmentStore();
const tools = createTools(store);

export function initLlm(_config: BotConfig): void {
  // No client initialization needed with AI SDK — uses env vars automatically
}

export interface ChatResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  metrics: {
    cachedTokens?: number;
    uncachedTokens?: number;
    latencyMs: number;
  };
  structuredData?: Record<string, unknown>;
}

export async function chat(
  config: BotConfig,
  message: string,
  channel: string,
): Promise<ChatResult> {
  const channelHistory = history.get(channel) ?? [];
  channelHistory.push({ role: 'user', content: message });

  const isAnthropic = config.model.startsWith('anthropic:');

  const startTime = performance.now();
  const result = await generateText({
    model: registry.languageModel(
      config.model as Parameters<typeof registry.languageModel>[0],
    ),
    maxOutputTokens: config.maxTokens,
    system: isAnthropic
      ? [
          {
            type: 'text' as const,
            text: config.systemPrompt,
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
        ]
      : config.systemPrompt,
    messages: channelHistory,
    tools,
    maxSteps: config.maxSteps,
  });
  const latencyMs = Math.round(performance.now() - startTime);

  const text = result.text;

  // Only append the final assistant text to history (not intermediate tool steps)
  channelHistory.push({ role: 'assistant', content: text });
  history.set(channel, channelHistory);

  const cachedTokens = result.usage.inputTokenDetails?.cacheReadTokens;
  const uncachedTokens = result.usage.inputTokenDetails?.noCacheTokens;

  // Extract structured data from tool results (last booking/reschedule result)
  let structuredData: Record<string, unknown> | undefined;
  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      if (
        toolResult.toolName === 'book_appointment' ||
        toolResult.toolName === 'reschedule_appointment'
      ) {
        const res = toolResult.result as Record<string, unknown>;
        if ('appointment' in res) {
          structuredData = res.appointment as Record<string, unknown>;
        } else if ('newAppointment' in res) {
          structuredData = res.newAppointment as Record<string, unknown>;
        }
      }
    }
  }

  return {
    text,
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
      latencyMs,
    },
    ...(structuredData ? { structuredData } : {}),
  };
}

export function clearHistory(channel?: string): void {
  if (channel) {
    history.delete(channel);
  } else {
    history.clear();
  }
}
