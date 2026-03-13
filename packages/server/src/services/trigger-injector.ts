/**
 * Trigger Injector
 *
 * Processes trigger steps in the eval conversation loop.
 * Formats triggers as XML and sends them to the bot endpoint,
 * capturing the bot's proactive response.
 */

import type { TmsConfig, TriggerPayload, TriggerStep, Message, EvalSpec } from '@tms/shared';
import { formatTriggerForIA } from './trigger-formatter.js';
import { sendToBot } from './bot-client.js';
import type { BotResponse } from './bot-client.js';

export interface TriggerInjectionResult {
  triggerMessage: Message;
  botResponse: BotResponse;
  botMessage: Message;
}

/**
 * Inject a trigger step into the conversation.
 *
 * Creates a trigger payload from the step definition, formats it as XML,
 * sends it to the bot endpoint, and returns the response. The caller
 * (conversation loop) is responsible for adding messages to the transcript
 * and broadcasting via WebSocket.
 */
export async function injectTriggerStep(
  step: TriggerStep,
  config: TmsConfig,
  channel: Message['channel'],
  evalSpec?: EvalSpec,
): Promise<TriggerInjectionResult> {
  const { trigger } = step;

  // Build trigger payload
  const payload: TriggerPayload = {
    type: trigger.type,
    userId: 'tms-test-user',
    message: trigger.message,
    timestamp: new Date().toISOString(),
    metadata: trigger.metadata ?? {},
  };

  // Format as XML
  const xmlMessage = formatTriggerForIA(payload);

  // Create the trigger message that goes to the bot endpoint
  const triggerMessage: Message = {
    id: crypto.randomUUID(),
    role: 'user' as const,
    content: xmlMessage,
    channel,
    timestamp: payload.timestamp,
  };

  // Send to bot endpoint
  const botResponse = await sendToBot(config, triggerMessage, undefined, evalSpec);

  // Build bot response message
  const botMessage: Message = {
    id: crypto.randomUUID(),
    role: 'bot' as const,
    content: botResponse.text,
    channel,
    timestamp: new Date().toISOString(),
  };

  if (botResponse.toolCalls?.length) botMessage.toolCalls = botResponse.toolCalls;
  if (botResponse.toolResults?.length) botMessage.toolResults = botResponse.toolResults;

  return { triggerMessage, botResponse, botMessage };
}
