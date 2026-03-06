import { createProviderRegistry, generateText, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { BotConfig } from './config.js';

const registry = createProviderRegistry({ anthropic, openai });

const history = new Map<string, ModelMessage[]>();

export function initLlm(_config: BotConfig): void {
  // No client initialization needed with AI SDK — uses env vars automatically
}

export async function chat(
  config: BotConfig,
  message: string,
  channel: string,
): Promise<string> {
  const channelHistory = history.get(channel) ?? [];
  channelHistory.push({ role: 'user', content: message });

  const { text } = await generateText({
    model: registry.languageModel(
      config.model as Parameters<typeof registry.languageModel>[0],
    ),
    maxOutputTokens: config.maxTokens,
    system: config.systemPrompt,
    messages: channelHistory,
  });

  channelHistory.push({ role: 'assistant', content: text });
  history.set(channel, channelHistory);

  return text;
}

export function clearHistory(channel?: string): void {
  if (channel) {
    history.delete(channel);
  } else {
    history.clear();
  }
}
