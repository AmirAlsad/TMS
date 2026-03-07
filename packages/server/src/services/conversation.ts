import type { ConversationResult, EvalSpec, Message, TmsConfig, TokenUsage, TurnUsage } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { sendToBot } from './bot-client.js';
import { UserBot } from './user-bot.js';

const WAIT_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_WAITS = 3;

const WAIT_TOKEN = '[WAIT]';
const GOAL_COMPLETE_TOKEN = '[GOAL_COMPLETE]';

function createMessage(
  role: 'user' | 'bot',
  content: string,
  channel: EvalSpec['channel'],
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    channel,
    timestamp: new Date().toISOString(),
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

export async function runConversation(
  config: TmsConfig,
  evalSpec: EvalSpec,
  broadcast: BroadcastFn,
): Promise<ConversationResult> {
  if (!config.userBot) {
    throw new Error('userBot configuration is required to run automated conversations');
  }

  const userBot = new UserBot(config.userBot);
  const transcript: Message[] = [];
  const turnUsages: TurnUsage[] = [];
  const userBotTotal: TokenUsage = { ...ZERO_USAGE };
  let goalCompleted = false;

  try {
    let consecutiveWaits = 0;

    for (let turn = 0; turn < evalSpec.turnLimit; turn++) {
      // Generate user bot message
      let userContent: string;
      const turnUbUsage: TokenUsage = { ...ZERO_USAGE };

      while (true) {
        const reply = await userBot.generateReply(transcript, evalSpec);
        userContent = reply.text;
        addToAccum(turnUbUsage, reply.usage);

        // Handle wait state
        if (userContent.trim() === WAIT_TOKEN && consecutiveWaits < MAX_CONSECUTIVE_WAITS) {
          consecutiveWaits++;
          await sleep(WAIT_DELAY_MS);
          continue;
        }
        break;
      }

      addToAccum(userBotTotal, turnUbUsage);

      // If after exhausting waits the user bot still says [WAIT], skip this turn
      if (userContent.trim() === WAIT_TOKEN) {
        turnUsages.push({ turn, userBot: turnUbUsage });
        continue;
      }

      // Got a real message — reset wait counter
      consecutiveWaits = 0;

      // Check for goal completion
      if (userContent.includes(GOAL_COMPLETE_TOKEN)) {
        userContent = userContent.replace(GOAL_COMPLETE_TOKEN, '').trim();
        goalCompleted = true;
      }

      // Broadcast and record user message
      if (userContent) {
        const userMessage = createMessage('user', userContent, evalSpec.channel);
        transcript.push(userMessage);
        broadcast({ type: 'user:message', payload: userMessage });
      }

      if (goalCompleted) {
        turnUsages.push({ turn, userBot: turnUbUsage });
        break;
      }

      // Send to target bot and get response
      const lastUserMessage = transcript[transcript.length - 1];
      if (!lastUserMessage) break;

      const botResult = await sendToBot(config, lastUserMessage);
      const botMessage = createMessage('bot', botResult.text, evalSpec.channel);
      if (botResult.toolCalls?.length) botMessage.toolCalls = botResult.toolCalls;
      if (botResult.toolResults?.length) botMessage.toolResults = botResult.toolResults;
      transcript.push(botMessage);
      broadcast({ type: 'bot:message', payload: botMessage });

      turnUsages.push({
        turn,
        userBot: turnUbUsage,
        botEndpoint: botResult.usage,
        botMetrics: botResult.metrics,
      });
    }

    return {
      transcript,
      turnCount: Math.ceil(transcript.length / 2),
      goalCompleted,
      turnUsages,
      userBotTotal,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return {
      transcript,
      turnCount: Math.ceil(transcript.length / 2),
      goalCompleted: false,
      error: errorMsg,
      turnUsages,
      userBotTotal,
    };
  }
}
