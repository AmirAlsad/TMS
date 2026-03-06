import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { EvalSpec, Message, TmsConfig } from '@tms/shared';

type UserBotConfig = NonNullable<TmsConfig['userBot']>;

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

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
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private config: UserBotConfig;

  constructor(config: UserBotConfig) {
    this.config = config;
    if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
    } else {
      this.openai = new OpenAI({ apiKey: config.apiKey });
    }
  }

  async generateReply(transcript: Message[], evalSpec: EvalSpec): Promise<string> {
    const systemPrompt = buildSystemPrompt(evalSpec, this.config.systemPrompt);

    if (this.config.provider === 'anthropic') {
      return this.generateAnthropic(transcript, systemPrompt);
    }
    return this.generateOpenAI(transcript, systemPrompt);
  }

  private async generateAnthropic(transcript: Message[], systemPrompt: string): Promise<string> {
    const model = this.config.model ?? DEFAULT_ANTHROPIC_MODEL;
    const messages: Anthropic.MessageParam[] = flipRoles(transcript);

    if (messages.length === 0) {
      messages.push({ role: 'user', content: START_PROMPT });
    }

    const response = await this.anthropic!.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text ?? '';
  }

  private async generateOpenAI(transcript: Message[], systemPrompt: string): Promise<string> {
    const model = this.config.model ?? DEFAULT_OPENAI_MODEL;
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...flipRoles(transcript),
    ];

    if (messages.length === 1) {
      messages.push({ role: 'user', content: START_PROMPT });
    }

    const response = await this.openai!.chat.completions.create({
      model,
      max_tokens: 1024,
      messages,
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
