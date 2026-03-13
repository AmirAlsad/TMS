import type {
  ConversationResult,
  EvalSpec,
  EvalPhase,
  EvalStep,
  TriggerStep,
  Message,
  TmsConfig,
  TokenUsage,
  TurnUsage,
  UserBotAction,
  WhatsAppEvent,
  WhatsAppReaction,
  WhatsAppTypingEvent,
} from '@tms/shared';
import { DEFAULT_MESSAGE_PACING_MS } from '@tms/shared';
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
import { saveCheckpoint, deleteCheckpoint } from './eval-results.js';
import { injectTriggerStep } from './trigger-injector.js';

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

/**
 * Check if an eval step is a trigger step.
 */
function isTriggerStep(step: EvalStep): step is TriggerStep {
  return 'trigger' in step;
}

/**
 * Run a steps-based conversation where triggers and user messages are interleaved
 * in a defined sequence.
 *
 * For trigger steps: inject the trigger directly and capture the bot's proactive response.
 * For message steps: run a normal user-bot turn.
 */
async function runStepsConversation(
  config: TmsConfig,
  evalSpec: EvalSpec,
  steps: EvalStep[],
  broadcast: BroadcastFn,
  log?: EvalLogFn,
  evalId?: string,
): Promise<ConversationResult> {
  if (!config.userBot) {
    throw new Error('userBot configuration is required to run automated conversations');
  }

  const isWhatsApp = evalSpec.channel === 'whatsapp';
  const callbackUrl = isWhatsApp ? `${getCallbackBaseUrl(config)}/api/whatsapp` : undefined;
  const pacingMs = DEFAULT_MESSAGE_PACING_MS;

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
  let messageTurnCount = 0;

  try {
    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx]!;

      if (isTriggerStep(step)) {
        // --- Trigger step: inject trigger and capture bot response ---
        log?.('info', `Step ${stepIdx + 1}: Injecting ${step.trigger.type} trigger`, {
          stepIndex: stepIdx,
          triggerType: step.trigger.type,
        });

        broadcast({
          type: 'trigger:received',
          payload: {
            triggerId: crypto.randomUUID(),
            trigger: {
              type: step.trigger.type,
              userId: 'tms-test-user',
              message: step.trigger.message,
              timestamp: new Date().toISOString(),
              metadata: step.trigger.metadata ?? {},
            },
          },
        });

        const triggerStartTime = performance.now();
        const result = await injectTriggerStep(step, config, evalSpec.channel, evalSpec);
        const triggerLatencyMs = Math.round(performance.now() - triggerStartTime);

        // Handle silence, multi-message, or single-message responses
        if (result.botResponse.silence) {
          log?.('info', `Trigger response: silence (${triggerLatencyMs}ms)`, {
            latencyMs: triggerLatencyMs,
            triggerType: step.trigger.type,
            silence: true,
          });
          const silenceMessage = createMessage('bot', '', evalSpec.channel, { silence: true });
          transcript.push(silenceMessage);
          broadcast({ type: 'bot:message', payload: silenceMessage });
        } else if (result.botResponse.messages && result.botResponse.messages.length > 0) {
          log?.('info', `Trigger response (${triggerLatencyMs}ms, ${result.botResponse.messages.length} messages)`, {
            latencyMs: triggerLatencyMs,
            triggerType: step.trigger.type,
            messageCount: result.botResponse.messages.length,
          });
          for (let mi = 0; mi < result.botResponse.messages.length; mi++) {
            const msgText = result.botResponse.messages[mi]!;
            const botMessage = createMessage('bot', msgText, evalSpec.channel);
            transcript.push(botMessage);
            broadcast({ type: 'bot:message', payload: botMessage });
            readReceiptService?.trackMessage(botMessage);
            if (mi < result.botResponse.messages.length - 1 && pacingMs > 0) await sleep(pacingMs);
          }
        } else {
          log?.('info', `Trigger response (${triggerLatencyMs}ms): ${result.botMessage.content.slice(0, 200)}`, {
            latencyMs: triggerLatencyMs,
            triggerType: step.trigger.type,
          });
          transcript.push(result.botMessage);
          broadcast({ type: 'bot:message', payload: result.botMessage });
          readReceiptService?.trackMessage(result.botMessage);
        }

        turnUsages.push({
          turn: stepIdx,
          botEndpoint: result.botResponse.usage,
          botMetrics: result.botResponse.metrics,
        });
      } else {
        // --- Message step: run normal user-bot turn ---
        messageTurnCount++;
        if (messageTurnCount > evalSpec.turnLimit) {
          log?.('info', `Turn limit reached at step ${stepIdx + 1}`, { stepIndex: stepIdx });
          break;
        }

        log?.('debug', `Step ${stepIdx + 1}: User bot turn ${messageTurnCount}`, {
          stepIndex: stepIdx,
          messageTurn: messageTurnCount,
        });

        if (messageTurnCount === 1) {
          log?.('debug', 'User bot system prompt rendered', {
            systemPrompt: userBot.getSystemPrompt(evalSpec),
          });
        }

        const turnUbUsage: TokenUsage = { ...ZERO_USAGE };

        // Generate user bot actions (with wait retry loop)
        let consecutiveWaits = 0;
        let actions: UserBotAction[];
        while (true) {
          const reply = await userBot.generateReply(transcript, evalSpec, events);
          actions = reply.actions;
          addToAccum(turnUbUsage, reply.usage);

          if (reply.reasoning) {
            log?.('debug', `User bot reasoning: ${reply.reasoning.slice(0, 500)}`, {
              reasoning: reply.reasoning,
              source: 'user-bot',
            });
          }

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

        const isStillWaitOnly = actions.length === 1 && actions[0]!.type === 'wait';
        if (isStillWaitOnly) {
          turnUsages.push({ turn: stepIdx, userBot: turnUbUsage });
          continue;
        }

        log?.('debug', 'User bot actions', { actionTypes: actions.map((a) => a.type) });
        let lastSentMessage: Message | null = null;

        for (const action of actions) {
          const result = dispatchAction(action, transcript, events, evalSpec, broadcast, config);
          if (result.message) lastSentMessage = result.message;
          if (result.goalComplete) goalCompleted = true;
        }

        if (goalCompleted) {
          log?.('info', `Goal completed at step ${stepIdx + 1}`, { stepIndex: stepIdx });
          turnUsages.push({ turn: stepIdx, userBot: turnUbUsage });
          break;
        }

        if (lastSentMessage) {
          readReceiptService?.onUserResponse();

          const botStartTime = performance.now();
          const botResult = await sendToBot(config, lastSentMessage, callbackUrl, evalSpec);
          const botLatencyMs = Math.round(performance.now() - botStartTime);

          if (isWhatsApp) emitTyping(broadcast, false, false);

          // Handle silence, multi-message, or single-message responses
          if (botResult.silence) {
            log?.('info', `Bot chose silence (${botLatencyMs}ms)`, { latencyMs: botLatencyMs, silence: true });
            const silenceMessage = createMessage('bot', '', evalSpec.channel, { silence: true });
            transcript.push(silenceMessage);
            broadcast({ type: 'bot:message', payload: silenceMessage });
            turnUsages.push({ turn: stepIdx, userBot: turnUbUsage, botEndpoint: botResult.usage, botMetrics: botResult.metrics });
          } else if (botResult.messages && botResult.messages.length > 0) {
            log?.('info', `Bot response (${botLatencyMs}ms, ${botResult.messages.length} messages)`, {
              latencyMs: botLatencyMs,
              messageCount: botResult.messages.length,
            });
            for (let mi = 0; mi < botResult.messages.length; mi++) {
              const msgText = botResult.messages[mi]!;
              const botMessage = createMessage('bot', msgText, evalSpec.channel);
              transcript.push(botMessage);
              broadcast({ type: 'bot:message', payload: botMessage });
              readReceiptService?.trackMessage(botMessage);
              if (mi < botResult.messages.length - 1 && pacingMs > 0) await sleep(pacingMs);
            }
            turnUsages.push({ turn: stepIdx, userBot: turnUbUsage, botEndpoint: botResult.usage, botMetrics: botResult.metrics });
          } else {
            log?.('info', `Bot response (${botLatencyMs}ms): ${botResult.text.slice(0, 200)}`, {
              latencyMs: botLatencyMs,
              contentLength: botResult.text.length,
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
            readReceiptService?.trackMessage(botMessage);
            turnUsages.push({ turn: stepIdx, userBot: turnUbUsage, botEndpoint: botResult.usage, botMetrics: botResult.metrics });
          }
        } else {
          turnUsages.push({ turn: stepIdx, userBot: turnUbUsage });
        }
      }

      // Save checkpoint after each step
      if (evalId) {
        await saveCheckpoint(evalId, {
          transcript,
          events: isWhatsApp ? events : undefined,
          turn: stepIdx + 1,
          turnUsages,
          userBotTotal,
          goalCompleted,
        });
      }
    }

    readReceiptService?.destroy();
    if (evalId) await deleteCheckpoint(evalId);

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
    log?.('error', `Steps conversation error: ${errorMsg}`, {
      step: turnUsages.length,
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

export async function runConversation(
  config: TmsConfig,
  evalSpec: EvalSpec,
  broadcast: BroadcastFn,
  log?: EvalLogFn,
  evalId?: string,
): Promise<ConversationResult> {
  // If the eval spec defines ordered steps, use the steps-based conversation loop
  if (evalSpec.steps && evalSpec.steps.length > 0) {
    log?.('info', `Running steps-based conversation (${evalSpec.steps.length} steps)`, {
      stepCount: evalSpec.steps.length,
      triggerSteps: evalSpec.steps.filter((s) => 'trigger' in s).length,
      messageSteps: evalSpec.steps.filter((s) => 'message' in s).length,
    });
    return runStepsConversation(config, evalSpec, evalSpec.steps, broadcast, log, evalId);
  }

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
      if (turn === 0) {
        log?.('debug', 'User bot system prompt rendered', {
          systemPrompt: userBot.getSystemPrompt(evalSpec),
        });
      }

      log?.('debug', `Turn ${turn + 1} starting`, { turn: turn + 1, turnLimit: evalSpec.turnLimit });
      const turnUbUsage: TokenUsage = { ...ZERO_USAGE };

      // Generate user bot actions (with wait retry loop)
      let actions: UserBotAction[];
      while (true) {
        const reply = await userBot.generateReply(transcript, evalSpec, events);
        actions = reply.actions;
        addToAccum(turnUbUsage, reply.usage);

        if (reply.reasoning) {
          log?.('debug', `User bot reasoning: ${reply.reasoning.slice(0, 500)}`, {
            reasoning: reply.reasoning,
            source: 'user-bot',
          });
        }

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
        const botResult = await sendToBot(config, lastSentMessage, callbackUrl, evalSpec);
        const botLatencyMs = Math.round(performance.now() - botStartTime);

        // Clear any lingering typing indicator after bot responds
        if (isWhatsApp) emitTyping(broadcast, false, false);

        const pacingMs = DEFAULT_MESSAGE_PACING_MS;

        // --- Silence handling ---
        if (botResult.silence) {
          log?.('info', `Bot chose silence (${botLatencyMs}ms)`, {
            latencyMs: botLatencyMs,
            silence: true,
          });

          const silenceMessage = createMessage('bot', '', evalSpec.channel, { silence: true });
          transcript.push(silenceMessage);
          broadcast({ type: 'bot:message', payload: silenceMessage });

          turnUsages.push({
            turn,
            userBot: turnUbUsage,
            botEndpoint: botResult.usage,
            botMetrics: botResult.metrics,
          });
        }
        // --- Multi-message handling ---
        else if (botResult.messages && botResult.messages.length > 0) {
          log?.('info', `Bot response (${botLatencyMs}ms, ${botResult.messages.length} messages)`, {
            latencyMs: botLatencyMs,
            messageCount: botResult.messages.length,
            contentLength: botResult.text.length,
          });

          for (let mi = 0; mi < botResult.messages.length; mi++) {
            const msgText = botResult.messages[mi]!;
            const botMessage = createMessage('bot', msgText, evalSpec.channel);
            transcript.push(botMessage);
            broadcast({ type: 'bot:message', payload: botMessage });
            readReceiptService?.trackMessage(botMessage);

            // Add pacing delay between messages (not after the last one)
            if (mi < botResult.messages.length - 1 && pacingMs > 0) {
              await sleep(pacingMs);
            }
          }

          turnUsages.push({
            turn,
            userBot: turnUbUsage,
            botEndpoint: botResult.usage,
            botMetrics: botResult.metrics,
          });
        }
        // --- Single message ---
        else {
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
        }
      } else {
        // Non-message actions only (e.g., just a reaction) — no bot call this turn
        turnUsages.push({ turn, userBot: turnUbUsage });
      }

      // Save checkpoint after each turn
      if (evalId) {
        await saveCheckpoint(evalId, {
          transcript,
          events: isWhatsApp ? events : undefined,
          turn: turn + 1,
          turnUsages,
          userBotTotal,
          goalCompleted,
        });
      }
    }

    readReceiptService?.destroy();

    if (evalId) {
      await deleteCheckpoint(evalId);
    }

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

/**
 * Run a multi-phase conversation.
 * Each phase runs as a separate conversation with its own personality/context/turnLimit,
 * but the transcript carries over between phases. Phase boundaries are marked in the transcript.
 */
export async function runMultiPhaseConversation(
  config: TmsConfig,
  evalSpec: EvalSpec,
  phases: EvalPhase[],
  broadcast: BroadcastFn,
  log?: EvalLogFn,
  evalId?: string,
): Promise<ConversationResult> {
  const allTranscript: Message[] = [];
  const allTurnUsages: TurnUsage[] = [];
  const allUserBotTotal: TokenUsage = { ...ZERO_USAGE };
  const allEvents: WhatsAppEvent[] = [];
  let totalTurnCount = 0;
  let overallGoalCompleted = false;

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex]!;
    const phaseLabel = `Phase ${phaseIndex + 1}`;

    log?.('info', `Starting ${phaseLabel}`, {
      phaseIndex: phaseIndex + 1,
      totalPhases: phases.length,
      turnLimit: phase.turnLimit,
    });

    // Insert a phase boundary marker into the transcript
    if (phaseIndex > 0) {
      const boundaryMsg = createMessage(
        'bot',
        `[PHASE BOUNDARY: Transitioning to ${phaseLabel}]`,
        evalSpec.channel,
      );
      allTranscript.push(boundaryMsg);
      broadcast({ type: 'bot:message', payload: boundaryMsg });
    }

    // Build a phase-specific eval spec by overlaying phase config onto the base spec
    const phaseSpec: EvalSpec = {
      ...evalSpec,
      turnLimit: phase.turnLimit,
      userBot: {
        goal: phase.userBot?.goal ?? evalSpec.userBot.goal,
        persona: phase.userBot?.persona ?? evalSpec.userBot.persona,
      },
      // Combine phase requirements with overall requirements for the conversation loop
      // (the judge handles them separately)
      requirements: [
        ...evalSpec.requirements,
        ...(phase.requirements ?? []),
      ],
      // Disable phases and steps on the inner spec to avoid infinite recursion / wrong routing
      phases: undefined,
      steps: undefined,
    };

    // Run the phase as a standalone conversation
    const phaseResult = await runConversation(
      config,
      phaseSpec,
      broadcast,
      log,
      evalId ? `${evalId}_phase${phaseIndex + 1}` : undefined,
    );

    // Accumulate results
    allTranscript.push(...phaseResult.transcript);
    allTurnUsages.push(...phaseResult.turnUsages.map((tu) => ({
      ...tu,
      turn: tu.turn + totalTurnCount,
    })));
    addToAccum(allUserBotTotal, phaseResult.userBotTotal);
    totalTurnCount += phaseResult.turnCount;
    if (phaseResult.events) {
      allEvents.push(...phaseResult.events);
    }

    if (phaseResult.error) {
      log?.('error', `${phaseLabel} failed: ${phaseResult.error}`);
      return {
        transcript: allTranscript,
        turnCount: totalTurnCount,
        goalCompleted: false,
        error: `${phaseLabel}: ${phaseResult.error}`,
        turnUsages: allTurnUsages,
        userBotTotal: allUserBotTotal,
        events: allEvents.length > 0 ? allEvents : undefined,
      };
    }

    if (phaseResult.goalCompleted) {
      overallGoalCompleted = true;
      log?.('info', `Goal completed in ${phaseLabel}`);
    }
  }

  // Clean up phase checkpoints
  if (evalId) {
    for (let i = 0; i < phases.length; i++) {
      await deleteCheckpoint(`${evalId}_phase${i + 1}`);
    }
  }

  return {
    transcript: allTranscript,
    turnCount: totalTurnCount,
    goalCompleted: overallGoalCompleted,
    turnUsages: allTurnUsages,
    userBotTotal: allUserBotTotal,
    events: allEvents.length > 0 ? allEvents : undefined,
  };
}
