import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { BotConfig } from './config.js';

let client: Anthropic;

const history = new Map<string, MessageParam[]>();

export function initLlm(config: BotConfig): void {
  client = new Anthropic({ apiKey: config.anthropic.apiKey });
}

export async function chat(
  config: BotConfig,
  message: string,
  channel: string,
): Promise<string> {
  const channelHistory = history.get(channel) ?? [];
  channelHistory.push({ role: 'user', content: message });

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: config.anthropic.maxTokens,
    system: config.systemPrompt,
    messages: channelHistory,
  });

  const block = response.content[0];
  if (block.type !== 'text') {
    throw new Error(`Unexpected response content type: ${block.type}`);
  }

  channelHistory.push({ role: 'assistant', content: block.text });
  history.set(channel, channelHistory);

  return block.text;
}

export function clearHistory(channel?: string): void {
  if (channel) {
    history.delete(channel);
  } else {
    history.clear();
  }
}
