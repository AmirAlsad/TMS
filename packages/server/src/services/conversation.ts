import type {
  ConversationResult,
  EvalSpec,
  Message,
  TmsConfig,
  TokenUsage,
  TurnUsage,
  UserBotAction,
  WhatsAppEvent,
  WhatsAppReaction,
  WhatsAppTypingEvent,
} from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import {
  sendToBot,
  sendStatusCallback,
  sendReactionCallback,
  getCallbackBaseUrl,
} from './bot-client.js';
import { UserBot } from './user-bot.js';
import { ReadReceiptService } from './read-receipt.js';
import type { EvalLogFn } from './eval-logger.js';

const WAIT_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_WAITS = 3;

function createMessage(
  role: 'user' | 'bot',
  content: string,
  channel: EvalSpec['channel'],
  extra?: Partial<Message>,
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    channel,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addToAccum(accum: TokenUsage, usage: TokenUsage): void {
  accum.promptTokens += usage.promptTokens;
  accum.completionTokens += usage.completionTokens;
  accum.totalTokens += usage.totalTokens;
}

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function emitTyping(broadcast: BroadcastFn, fromUser: boolean, active: boolean): void {
  const type = active ? 'typing_start' : 'typing_stop';
  const event: WhatsAppTypingEvent = {
    type,
    fromUser,
    timestamp: new Date().toISOString(),
  };
  broadcast({ type: `whatsapp:${type}`, payload: event });
}

/**
 * Dispatch a single user bot action. Returns the Message if a message was sent
 * (so the caller knows to forward it to the bot endpoint), or null for non-message actions.
 * Reactions fire immediate callbacks to the bot endpoint (matching Twilio behavior).
 */
function dispatchAction(
  action: UserBotAction,
  transcript: Message[],
  events: WhatsAppEvent[],
  evalSpec: EvalSpec,
  broadcast: BroadcastFn,
  config: TmsConfig,
): { message: Message | null; goalComplete: boolean } {
  const isWhatsApp = evalSpec.channel === 'whatsapp';

  switch (action.type) {
    case 'send_message': {
      if (isWhatsApp) emitTyping(broadcast, true, true);
      const msg = createMessage('user', action.body, evalSpec.channel);
      transcript.push(msg);
      broadcast({ type: 'user:message', payload: msg });
      if (isWhatsApp) emitTyping(broadcast, true, false);
      return { message: msg, goalComplete: action.goalComplete ?? false };
    }

    case 'reply_to_message': {
      const target = transcript.find((m) => m.id === action.targetMessageId);
      const quotedBody = target?.content ?? '';
      if (isWhatsApp) emitTyping(broadcast, true, true);
      const msg = createMessage('user', action.body, evalSpec.channel, {
        quotedReply: { targetMessageId: action.targetMessageId, quotedBody },
      });
      transcript.push(msg);
      broadcast({ type: 'user:message', payload: msg });
      if (isWhatsApp) emitTyping(broadcast, true, false);
      return { message: msg, goalComplete: action.goalComplete ?? false };
    }

    case 'react_to_message': {
      const reaction: WhatsAppReaction = {
        type: 'reaction',
        fromUser: true,
        targetMessageId: action.targetMessageId,
        emoji: action.emoji,
        timestamp: new Date().toISOString(),
      };
      events.push(reaction);
      broadcast({ type: 'whatsapp:reaction', payload: reaction });
      // Fire immediate callback to bot endpoint (matches Twilio webhook behavior)
      sendReactionCallback(config, reaction).catch(() => {});
      return { message: null, goalComplete: false };
    }

    case 'remove_reaction': {
      const removal: WhatsAppReaction = {
        type: 'reaction_removed',
        fromUser: true,
        targetMessageId: action.targetMessageId,
        emoji: '',
        timestamp: new Date().toISOString(),
      };
      events.push(removal);
      broadcast({ type: 'whatsapp:reaction_removed', payload: removal });
      // Fire immediate callback to bot endpoint
      sendReactionCallback(config, removal).catch(() => {});
      return { message: null, goalComplete: false };
    }

    case 'send_voice_note': {
      const msg = createMessage('user', '', evalSpec.channel, {
        mediaType: 'audio/ogg',
        mediaUrl: action.audioRef,
      });
      transcript.push(msg);
      broadcast({ type: 'user:message', payload: msg });
      return { message: msg, goalComplete: false };
    }

    case 'send_media': {
      if (isWhatsApp) emitTyping(broadcast, true, true);
      const msg = createMessage('user', action.caption ?? '', evalSpec.channel, {
        mediaType: action.mediaType,
        mediaUrl: action.mediaUrl,
      });
      transcript.push(msg);
      broadcast({ type: 'user:message', payload: msg });
      if (isWhatsApp) emitTyping(broadcast, true, false);
      return { message: msg, goalComplete: action.goalComplete ?? false };
    }

    case 'wait': {
      return { message: null, goalComplete: false };
    }
  }
}

export async function runConversation(
  config: TmsConfig,
  evalSpec: EvalSpec,
  broadcast: BroadcastFn,
  log?: EvalLogFn,
): Promise<ConversationResult> {
  if (!config.userBot) {
    throw new Error('userBot configuration is required to run automated conversations');
  }

  const isWhatsApp = evalSpec.channel === 'whatsapp';
  const callbackUrl = isWhatsApp ? `${getCallbackBaseUrl(config)}/api/whatsapp` : undefined;

  // Create a per-conversation ReadReceiptService for WhatsApp channels.
  // The onRead callback fires a status callback to the bot endpoint for each read message,
  // mimicking Twilio's StatusCallback webhook with MessageStatus: read.
  const readReceiptService = isWhatsApp
    ? new ReadReceiptService(
        evalSpec.whatsapp?.readReceipts ?? { mode: 'on_response' },
        broadcast,
        (messageId) => {
          sendStatusCallback(config, messageId, 'read').catch(() => {});
        },
      )
    : undefined;

  const userBot = new UserBot(config.userBot);
  const transcript: Message[] = [];
  const events: WhatsAppEvent[] = [];
  const turnUsages: TurnUsage[] = [];
  const userBotTotal: TokenUsage = { ...ZERO_USAGE };
  let goalCompleted = false;

  try {
    let consecutiveWaits = 0;

    for (let turn = 0; turn < evalSpec.turnLimit; turn++) {
      log?.('debug', `Turn ${turn + 1} starting`, { turn: turn + 1, turnLimit: evalSpec.turnLimit });
      const turnUbUsage: TokenUsage = { ...ZERO_USAGE };

      // Generate user bot actions (with wait retry loop)
      let actions: UserBotAction[];
      while (true) {
        const reply = await userBot.generateReply(transcript, evalSpec, events);
        actions = reply.actions;
        addToAccum(turnUbUsage, reply.usage);

        // Check if it's a pure wait
        const isWaitOnly = actions.length === 1 && actions[0]!.type === 'wait';

        if (isWaitOnly && consecutiveWaits < MAX_CONSECUTIVE_WAITS) {
          consecutiveWaits++;
          log?.('debug', `User bot waiting (${consecutiveWaits}/${MAX_CONSECUTIVE_WAITS})`, {
            consecutiveWaits,
          });
          await sleep(WAIT_DELAY_MS);
          continue;
        }
        break;
      }

      addToAccum(userBotTotal, turnUbUsage);

      // If after exhausting waits the user bot still only says wait, skip this turn
      const isStillWaitOnly = actions.length === 1 && actions[0]!.type === 'wait';
      if (isStillWaitOnly) {
        turnUsages.push({ turn, userBot: turnUbUsage });
        continue;
      }

      // Got real actions -- reset wait counter
      consecutiveWaits = 0;

      // Dispatch all actions, collect any messages to send to bot
      log?.('debug', `User bot actions`, {
        actionTypes: actions.map((a) => a.type),
      });
      let lastSentMessage: Message | null = null;

      for (const action of actions) {
        const result = dispatchAction(action, transcript, events, evalSpec, broadcast, config);
        if (result.message) {
          lastSentMessage = result.message;
        }
        if (result.goalComplete) {
          goalCompleted = true;
        }
      }

      if (goalCompleted) {
        log?.('info', `Goal completed at turn ${turn + 1}`, { turn: turn + 1 });
        turnUsages.push({ turn, userBot: turnUbUsage });
        break;
      }

      // Mark all unread bot messages as read when user responds
      if (lastSentMessage) {
        readReceiptService?.onUserResponse();
      }

      // Send the last user message to the bot endpoint and get response.
      // Only the callback URL is passed — reactions and read states are sent as
      // separate immediate callbacks, matching Twilio's webhook model.
      if (lastSentMessage) {
        const botStartTime = performance.now();
        const botResult = await sendToBot(config, lastSentMessage, callbackUrl);
        const botLatencyMs = Math.round(performance.now() - botStartTime);

        // Clear any lingering typing indicator after bot responds
        if (isWhatsApp) emitTyping(broadcast, false, false);

        log?.('info', `Bot response (${botLatencyMs}ms): ${botResult.text.slice(0, 200)}`, {
          latencyMs: botLatencyMs,
          contentLength: botResult.text.length,
          toolCallCount: botResult.toolCalls?.length ?? 0,
        });

        const botMessage = createMessage('bot', botResult.text, evalSpec.channel);
        if (botResult.toolCalls?.length) botMessage.toolCalls = botResult.toolCalls;
        if (botResult.toolResults?.length) botMessage.toolResults = botResult.toolResults;
        if (botResult.mediaType) {
          botMessage.mediaType = botResult.mediaType;
          botMessage.mediaUrl = botResult.mediaUrl;
        }
        transcript.push(botMessage);
        broadcast({ type: 'bot:message', payload: botMessage });

        // Track bot message for read receipts
        readReceiptService?.trackMessage(botMessage);

        turnUsages.push({
          turn,
          userBot: turnUbUsage,
          botEndpoint: botResult.usage,
          botMetrics: botResult.metrics,
        });
      } else {
        // Non-message actions only (e.g., just a reaction) — no bot call this turn
        turnUsages.push({ turn, userBot: turnUbUsage });
      }
    }

    readReceiptService?.destroy();

    return {
      transcript,
      turnCount: Math.ceil(transcript.length / 2),
      goalCompleted,
      turnUsages,
      userBotTotal,
      events: isWhatsApp ? events : undefined,
    };
  } catch (err) {
    readReceiptService?.destroy();

    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    log?.('error', `Conversation error: ${errorMsg}`, {
      turn: Math.ceil(transcript.length / 2),
      error: errorMsg,
    });
    return {
      transcript,
      turnCount: Math.ceil(transcript.length / 2),
      goalCompleted: false,
      error: errorMsg,
      turnUsages,
      userBotTotal,
      events: isWhatsApp ? events : undefined,
    };
  }
}
