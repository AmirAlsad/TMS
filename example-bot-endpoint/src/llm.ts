import { createProviderRegistry, generateText, stepCountIs, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { BotConfig } from './config.js';
import { log } from './logger.js';
import { AppointmentStore } from './store.js';
import { createTools } from './tools.js';

const registry = createProviderRegistry({ anthropic, openai });

const history = new Map<string, ModelMessage[]>();

const store = new AppointmentStore();
const tools = createTools(store);

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
    latencyMs: number;
  };
  structuredData?: Record<string, unknown>;
  toolCalls: ToolCallInfo[];
  toolResults: ToolResultInfo[];
}

export async function chat(
  config: BotConfig,
  message: string,
  channel: string,
): Promise<ChatResult> {
  const channelHistory = history.get(channel) ?? [];
  channelHistory.push({ role: 'user', content: message });

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
    toolCalls,
    toolResults: toolResultInfos,
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
