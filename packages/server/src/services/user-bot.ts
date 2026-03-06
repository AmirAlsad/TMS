import { generateText } from 'ai';
import type { EvalSpec, Message, TmsConfig, TokenUsage } from '@tms/shared';
import { resolveModel } from './ai-registry.js';

type UserBotConfig = NonNullable<TmsConfig['userBot']>;

function buildSystemPrompt(evalSpec: EvalSpec, customBase?: string): string {
  const base =
    customBase ??
    `You are simulating a real user in a text message conversation with a bot. Write short, natural text messages like a real person would. Do not break character.`;

  return `${base}

## Your Goal
${evalSpec.userBot.goal}

## Your Persona
${evalSpec.userBot.persona}

## Special Instructions
- If the bot says it is working on something, processing, or needs time, respond with exactly [WAIT] and nothing else. This tells the system to pause before continuing.
- When your goal has been fully achieved and the conversation can naturally end, include [GOAL_COMPLETE] at the end of your message.
- Stay in character at all times. Write concise text messages, not formal paragraphs.`;
}

// In the TMS transcript, "user" = user bot, "bot" = target bot.
// For the user bot LLM, we flip roles: user bot messages become "assistant"
// (since the LLM is generating as the user bot) and target bot messages become "user".
function flipRoles(
  transcript: Message[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return transcript.map((msg) => ({
    role: msg.role === 'user' ? ('assistant' as const) : ('user' as const),
    content: msg.content,
  }));
}

const START_PROMPT = 'Start the conversation based on your goal.';

export class UserBot {
  private config: UserBotConfig;

  constructor(config: UserBotConfig) {
    this.config = config;
  }

  async generateReply(
    transcript: Message[],
    evalSpec: EvalSpec,
  ): Promise<{ text: string; usage: TokenUsage }> {
    const systemPrompt = buildSystemPrompt(evalSpec, this.config.systemPrompt);
    const messages = flipRoles(transcript);

    if (messages.length === 0) {
      messages.push({ role: 'user', content: START_PROMPT });
    }

    const { text, usage } = await generateText({
      model: resolveModel(this.config.model),
      system: systemPrompt,
      messages,
      maxOutputTokens: 1024,
    });

    return {
      text,
      usage: {
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      },
    };
  }
}
