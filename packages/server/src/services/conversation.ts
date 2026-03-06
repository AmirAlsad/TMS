import type { ConversationResult, EvalSpec, Message, TmsConfig } from '@tms/shared';
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
  let goalCompleted = false;

  try {
    for (let turn = 0; turn < evalSpec.turnLimit; turn++) {
      // Generate user bot message
      let userContent: string;
      let consecutiveWaits = 0;

      while (true) {
        userContent = await userBot.generateReply(transcript, evalSpec);

        // Handle wait state
        if (userContent.trim() === WAIT_TOKEN && consecutiveWaits < MAX_CONSECUTIVE_WAITS) {
          consecutiveWaits++;
          await sleep(WAIT_DELAY_MS);
          continue;
        }
        break;
      }

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

      if (goalCompleted) break;

      // Send to target bot and get response
      const lastUserMessage = transcript[transcript.length - 1];
      if (!lastUserMessage) break;

      const botResponse = await sendToBot(config, lastUserMessage);
      const botMessage = createMessage('bot', botResponse, evalSpec.channel);
      transcript.push(botMessage);
      broadcast({ type: 'bot:message', payload: botMessage });
    }

    return {
      transcript,
      turnCount: Math.ceil(transcript.length / 2),
      goalCompleted,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return {
      transcript,
      turnCount: Math.ceil(transcript.length / 2),
      goalCompleted: false,
      error: errorMsg,
    };
  }
}
