import { generateText, tool } from 'ai';
import type { Tool } from 'ai';
import { z } from 'zod';
import type {
  EvalSpec,
  Message,
  TmsConfig,
  TokenUsage,
  UserBotAction,
  WhatsAppEvent,
} from '@tms/shared';
import { resolveModel } from './ai-registry.js';

type UserBotConfig = NonNullable<TmsConfig['userBot']>;

// --- Tool definitions (no execute functions — client-side dispatch) ---

const sendMessageTool = tool({
  description: 'Send a text message to the bot.',
  inputSchema: z.object({
    body: z.string().describe('The message text to send'),
    goal_complete: z.boolean().optional().describe('Set true if your goal has been fully achieved'),
  }),
});

const reactToMessageTool = tool({
  description:
    'React to a specific message with an emoji. Use for emotional acknowledgment or quick feedback without a full reply.',
  inputSchema: z.object({
    targetMessageId: z.string().describe('The id of the message to react to'),
    emoji: z
      .string()
      .describe('A single emoji character (e.g. 👍, ❤️, 😂). Must be a valid Unicode emoji.'),
  }),
});

const removeReactionTool = tool({
  description: 'Remove a previously sent reaction from a message.',
  inputSchema: z.object({
    targetMessageId: z.string().describe('The id of the message to remove the reaction from'),
  }),
});

const replyToMessageTool = tool({
  description:
    'Reply to a specific message (quoted reply). Use when responding to a particular item in a multi-part conversation.',
  inputSchema: z.object({
    targetMessageId: z.string().describe('The id of the message to quote-reply to'),
    body: z.string().describe('The reply text'),
    goal_complete: z.boolean().optional().describe('Set true if your goal has been fully achieved'),
  }),
});

const sendVoiceNoteTool = tool({
  description: 'Send a voice note. Only available when the eval spec allows voice notes.',
  inputSchema: z.object({
    audioRef: z.string().describe('Reference key for a pre-recorded voice note asset'),
  }),
});

const sendMediaTool = tool({
  description:
    'Send a media file (image, document, or contact card) to the bot. Use the media asset refs provided in your instructions.',
  inputSchema: z.object({
    mediaType: z
      .string()
      .describe('MIME type of the media (e.g. "image/jpeg", "application/pdf", "text/vcard")'),
    mediaUrl: z.string().describe('URL or asset reference for the media file'),
    caption: z.string().optional().describe('Optional text caption to accompany the media'),
    goal_complete: z
      .boolean()
      .optional()
      .describe('Set true if your goal has been fully achieved'),
  }),
});

const waitTool = tool({
  description:
    'Wait for the bot to finish processing. Use when the bot says it is working on something or needs time.',
  inputSchema: z.object({}),
});

// --- System prompt builder ---

function buildSystemPrompt(evalSpec: EvalSpec, customBase?: string): string {
  const base =
    customBase ??
    `You are simulating a real user in a text message conversation with a bot. Write short, natural text messages like a real person would. Do not break character.`;

  const isWhatsApp = evalSpec.channel === 'whatsapp';
  const waConfig = evalSpec.whatsapp?.userBot;

  let actionsSection: string;

  if (isWhatsApp) {
    const lines = [
      `## Communication Style`,
      `You are chatting on WhatsApp. Use the available tools to perform actions:`,
      ``,
      `- **send_message**: Send a regular text message. This is your primary action.`,
    ];

    if (waConfig?.allowReactions !== false) {
      lines.push(
        `- **react_to_message**: React with an emoji to acknowledge a message without a full reply.`,
        `  Good for: thumbs up to confirm, heart for appreciation, laughing at humor.`,
        `  Don't overuse -- only when it feels natural.`,
      );
    }

    if (waConfig?.allowQuotedReplies !== false) {
      lines.push(
        `- **reply_to_message**: Quote-reply to a specific message. Use when:`,
        `  - The bot sent multiple items and you're responding to one specifically`,
        `  - You want to reference something said earlier in the conversation`,
        `  - Clarity requires pointing to a specific message`,
      );
    }

    if (waConfig?.allowVoiceNotes) {
      const assets = waConfig.voiceNoteAssets ?? [];
      lines.push(
        `- **send_voice_note**: Send a voice note. Available audio refs: ${assets.length > 0 ? assets.join(', ') : '(none pre-recorded)'}`,
      );
    }

    if (waConfig?.allowMediaMessages) {
      const assets = waConfig.mediaAssets ?? [];
      if (assets.length > 0) {
        const assetLines = assets.map(
          (a) => `    - "${a.ref}": mediaType="${a.mediaType}", mediaUrl="${a.mediaUrl}"`,
        );
        lines.push(
          `- **send_media**: Send an image, document, or contact card. Available assets:`,
          ...assetLines,
          `  When calling send_media, use the exact mediaType and mediaUrl values listed above.`,
        );
      } else {
        lines.push(
          `- **send_media**: Send an image, document, or contact card to the bot.`,
        );
      }
    }

    lines.push(
      `- **wait**: If the bot says it's processing or needs time, use this to pause.`,
      ``,
      `You may perform multiple actions per turn (e.g., react to a message AND send a reply).`,
      `Always use send_message or reply_to_message for substantive communication.`,
      `Set goal_complete: true on your final message when your goal has been achieved.`,
    );

    actionsSection = lines.join('\n');
  } else {
    actionsSection = `## Communication Style
You are chatting via SMS. Use the available tools to perform actions:

- **send_message**: Send a text message. This is your primary action.
- **wait**: If the bot says it's processing or needs time, use this to pause.

Set goal_complete: true on your final send_message when your goal has been achieved.`;
  }

  return `${base}

## Your Goal
${evalSpec.userBot.goal}

## Your Persona
${evalSpec.userBot.persona}

${actionsSection}

## Special Instructions
- If you have sent wait multiple times and the bot still hasn't completed the action, stop waiting and ask about the status or repeat your request instead.
- Stay in character at all times. Write concise text messages, not formal paragraphs.`;
}

// --- Role flipping for transcript context ---

function buildTranscriptMessages(
  transcript: Message[],
  events: WhatsAppEvent[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Combine messages and events chronologically
  type Entry = { timestamp: string; text: string; isUserBot: boolean };
  const entries: Entry[] = [];

  for (const msg of transcript) {
    let text = msg.content;
    if (msg.quotedReply) {
      text = `[quoted ${msg.quotedReply.targetMessageId}: "${msg.quotedReply.quotedBody}"] ${text}`;
    }
    if (msg.mediaType) {
      text = `[${msg.mediaType}] ${text}`;
    }
    entries.push({
      timestamp: msg.timestamp,
      text,
      isUserBot: msg.role === 'user',
    });
  }

  for (const event of events) {
    if (event.type === 'reaction' || event.type === 'reaction_removed') {
      const label = event.type === 'reaction' ? 'reacted' : 'removed reaction';
      const who = event.fromUser ? 'You' : 'Bot';
      entries.push({
        timestamp: event.timestamp,
        text: `[${who} ${label} ${event.emoji} on message ${event.targetMessageId}]`,
        isUserBot: event.fromUser,
      });
    } else if (event.type === 'read_receipt') {
      entries.push({
        timestamp: event.readAt,
        text: `[Read receipt: message ${event.messageId} read at ${event.readAt}]`,
        isUserBot: false,
      });
    }
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Flip roles: user bot messages become "assistant", target bot messages become "user"
  // Group consecutive entries by the same role
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const entry of entries) {
    const role = entry.isUserBot ? ('assistant' as const) : ('user' as const);
    if (messages.length > 0 && messages[messages.length - 1]!.role === role) {
      messages[messages.length - 1]!.content += '\n' + entry.text;
    } else {
      messages.push({ role, content: entry.text });
    }
  }

  return messages;
}

// --- Build filtered tool set based on eval spec ---

function buildToolSet(evalSpec: EvalSpec): Record<string, Tool> {
  const tools: Record<string, Tool> = {
    send_message: sendMessageTool,
    wait: waitTool,
  };

  if (evalSpec.channel === 'whatsapp') {
    const waConfig = evalSpec.whatsapp?.userBot;

    if (waConfig?.allowReactions !== false) {
      tools.react_to_message = reactToMessageTool;
      tools.remove_reaction = removeReactionTool;
    }

    if (waConfig?.allowQuotedReplies !== false) {
      tools.reply_to_message = replyToMessageTool;
    }

    if (waConfig?.allowVoiceNotes) {
      tools.send_voice_note = sendVoiceNoteTool;
    }

    if (waConfig?.allowMediaMessages) {
      tools.send_media = sendMediaTool;
    }
  }

  return tools;
}

// --- Map tool calls to UserBotAction ---

function toolCallToAction(toolName: string, args: Record<string, unknown>): UserBotAction {
  switch (toolName) {
    case 'send_message':
      return {
        type: 'send_message',
        body: args.body as string,
        goalComplete: args.goal_complete as boolean | undefined,
      };
    case 'react_to_message':
      return {
        type: 'react_to_message',
        targetMessageId: args.targetMessageId as string,
        emoji: args.emoji as string,
      };
    case 'remove_reaction':
      return {
        type: 'remove_reaction',
        targetMessageId: args.targetMessageId as string,
      };
    case 'reply_to_message':
      return {
        type: 'reply_to_message',
        targetMessageId: args.targetMessageId as string,
        body: args.body as string,
        goalComplete: args.goal_complete as boolean | undefined,
      };
    case 'send_voice_note':
      return {
        type: 'send_voice_note',
        audioRef: args.audioRef as string,
      };
    case 'send_media':
      return {
        type: 'send_media',
        mediaType: args.mediaType as string,
        mediaUrl: args.mediaUrl as string,
        caption: args.caption as string | undefined,
        goalComplete: args.goal_complete as boolean | undefined,
      };
    case 'wait':
      return { type: 'wait' };
    default:
      // Fallback: treat unknown tool as a text message
      return { type: 'send_message', body: JSON.stringify(args) };
  }
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
    events: WhatsAppEvent[] = [],
  ): Promise<{ actions: UserBotAction[]; usage: TokenUsage }> {
    const systemPrompt = buildSystemPrompt(evalSpec, this.config.systemPrompt);
    const messages = buildTranscriptMessages(transcript, events);
    const tools = buildToolSet(evalSpec);

    if (messages.length === 0) {
      messages.push({ role: 'user', content: START_PROMPT });
    }

    const result = await generateText({
      model: resolveModel(this.config.model),
      system: systemPrompt,
      messages,
      tools,
      maxOutputTokens: 1024,
    });

    const usage: TokenUsage = {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      totalTokens:
        result.usage.totalTokens ??
        (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
    };

    // Extract actions from tool calls
    const actions: UserBotAction[] = [];

    if (result.toolCalls && result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        actions.push(toolCallToAction(tc.toolName, tc.input as Record<string, unknown>));
      }
    }

    // If the LLM produced text but no tool calls, treat it as a send_message
    // (fallback for models that don't reliably use tools)
    if (actions.length === 0 && result.text) {
      const goalComplete = result.text.includes('[GOAL_COMPLETE]');
      const body = result.text.replace('[GOAL_COMPLETE]', '').trim();
      if (body === '[WAIT]') {
        actions.push({ type: 'wait' });
      } else if (body) {
        actions.push({ type: 'send_message', body, goalComplete: goalComplete || undefined });
      }
    }

    return { actions, usage };
  }
}
