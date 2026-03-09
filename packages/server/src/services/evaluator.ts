import { generateText } from 'ai';
import type {
  Message,
  TmsConfig,
  EvalRequirement,
  Classification,
  TokenUsage,
  WhatsAppEvent,
} from '@tms/shared';
import { resolveModel } from './ai-registry.js';

export interface JudgeInput {
  transcript: Message[];
  requirements: string[];
  specName: string;
  specDescription?: string;
  events?: WhatsAppEvent[];
}

export interface JudgeOutput {
  requirements: EvalRequirement[];
  classification: Classification;
  usage: TokenUsage;
}

const CLASSIFICATION_RANK: Record<Classification, number> = {
  passed: 0,
  needs_review: 1,
  failed: 2,
};

const RANK_TO_CLASSIFICATION: Classification[] = ['passed', 'needs_review', 'failed'];

function buildPrompt(input: JudgeInput): { system: string; user: string } {
  // Build chronological entries from messages and events
  type TranscriptEntry = { timestamp: string; text: string };
  const entries: TranscriptEntry[] = [];

  for (const m of input.transcript) {
    let line = `[${m.role.toUpperCase()}]: ${m.content}`;
    if (m.quotedReply) {
      line = `[${m.role.toUpperCase()} quoted ${m.quotedReply.targetMessageId}]: ${m.content}`;
    }
    if (m.mediaType) {
      line = `[${m.role.toUpperCase()} ${m.mediaType}]: ${m.content || '(media)'}`;
    }
    if (m.toolCalls?.length) {
      const calls = m.toolCalls
        .map((tc) => `  - ${tc.toolName}(${JSON.stringify(tc.input)})`)
        .join('\n');
      line += `\n[TOOL CALLS]:\n${calls}`;
    }
    if (m.toolResults?.length) {
      const results = m.toolResults
        .map((tr) => `  - ${tr.toolName} → ${JSON.stringify(tr.result)}`)
        .join('\n');
      line += `\n[TOOL RESULTS]:\n${results}`;
    }
    entries.push({ timestamp: m.timestamp, text: line });
  }

  // Interleave WhatsApp events
  if (input.events) {
    for (const event of input.events) {
      if (event.type === 'reaction' || event.type === 'reaction_removed') {
        const who = event.fromUser ? 'USER' : 'BOT';
        const action =
          event.type === 'reaction' ? `reacted ${event.emoji} to` : 'removed reaction from';
        entries.push({
          timestamp: event.timestamp,
          text: `[${who} ${action} message ${event.targetMessageId}]`,
        });
      } else if (event.type === 'read_receipt') {
        entries.push({
          timestamp: event.readAt,
          text: `[READ RECEIPT: message ${event.messageId} read at ${event.readAt}]`,
        });
      }
    }
  }

  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const transcriptText = entries.map((e) => e.text).join('\n');

  const requirementsList = input.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');

  const system = `You are a QA judge evaluating a conversation between a user and a bot.
You will be given a conversation transcript and a list of requirements.
For each requirement, classify it as one of: "passed", "needs_review", or "failed".
Provide brief reasoning for each classification.

When evaluating, consider:
- Whether the bot used appropriate tools rather than fabricating data or making up information.
- Whether tool inputs were correct and reasonable for the user's request.
- Whether tool results were accurately communicated to the user without distortion.
- The overall conversational quality, including tone, helpfulness, and logical flow.

The transcript may include [TOOL CALLS] and [TOOL RESULTS] sections showing the bot's tool usage. Use these to verify the bot's behavior against the requirements.

The transcript may also include WhatsApp-specific events such as reactions, quoted replies, and read receipts. Consider these when evaluating conversational quality and responsiveness.

Respond with ONLY valid JSON in this exact format:
{
  "requirements": [
    {
      "description": "the requirement text",
      "classification": "passed" | "needs_review" | "failed",
      "reasoning": "brief explanation"
    }
  ]
}`;

  const user = `## Eval Spec: ${input.specName}
${input.specDescription ? `${input.specDescription}\n` : ''}
## Conversation Transcript
${transcriptText}

## Requirements to Evaluate
${requirementsList}

Evaluate each requirement against the conversation transcript.`;

  return { system, user };
}

interface JudgeResponseRequirement {
  description: string;
  classification: Classification;
  reasoning: string;
}

interface JudgeResponse {
  requirements: JudgeResponseRequirement[];
}

function parseJudgeResponse(text: string, input: JudgeInput): Omit<JudgeOutput, 'usage'> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Judge response did not contain valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]) as JudgeResponse;

  if (!Array.isArray(parsed.requirements)) {
    throw new Error('Judge response missing requirements array');
  }

  const validClassifications = new Set<string>(['passed', 'needs_review', 'failed']);
  const requirements: EvalRequirement[] = parsed.requirements.map((r, i) => {
    const classification = validClassifications.has(r.classification)
      ? (r.classification as Classification)
      : 'needs_review';

    return {
      description: r.description || input.requirements[i] || `Requirement ${i + 1}`,
      classification,
      reasoning: r.reasoning || '',
    };
  });

  let worstRank = 0;
  for (const req of requirements) {
    const rank = CLASSIFICATION_RANK[req.classification!];
    if (rank > worstRank) worstRank = rank;
  }

  return {
    requirements,
    classification: RANK_TO_CLASSIFICATION[worstRank]!,
  };
}

export async function evaluateTranscript(
  config: TmsConfig,
  input: JudgeInput,
): Promise<JudgeOutput> {
  const prompt = buildPrompt(input);

  if (!config.judge) {
    throw new Error('Judge config is required for evaluation');
  }

  const { text, usage } = await generateText({
    model: resolveModel(config.judge.model),
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxOutputTokens: 4096,
  });

  return {
    ...parseJudgeResponse(text, input),
    usage: {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    },
  };
}
