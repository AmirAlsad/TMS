import { generateText } from 'ai';
import type {
  Message,
  TmsConfig,
  EvalRequirement,
  Classification,
  TokenUsage,
  WhatsAppEvent,
  PriorSession,
  EvalPhase,
} from '@tms/shared';
import { resolveModel } from './ai-registry.js';
import type { EvalLogFn } from './eval-logger.js';

export interface JudgeInput {
  transcript: Message[];
  requirements: string[];
  specName: string;
  specDescription?: string;
  events?: WhatsAppEvent[];
  judgeInstructions?: string;
  /** Whether silence is expected from the bot (Tier 4.2) */
  silenceExpected?: boolean;
  /** Prior session context for cross-session continuity evaluation (Tier 4.4) */
  priorSession?: PriorSession;
  /** Phase definitions for multi-phase evaluation (Tier 4.5) */
  phases?: EvalPhase[];
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
    // Handle silence messages (Tier 4.2)
    if (m.silence) {
      entries.push({
        timestamp: m.timestamp,
        text: `[BOT SILENCE]: The bot deliberately chose not to respond.`,
      });
      continue;
    }

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

  let system = `You are a QA judge evaluating a conversation between a user and a bot.
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

The bot may send multiple consecutive messages as part of a single response (multi-message splitting). This is a deliberate design choice — evaluate whether the splitting creates a natural conversational rhythm and whether the message boundaries are placed at meaningful points.`;

  // Silence evaluation instructions (Tier 4.2)
  if (input.silenceExpected !== undefined) {
    if (input.silenceExpected) {
      system += `

## Silence Evaluation
The transcript may contain [BOT SILENCE] entries indicating the bot deliberately chose not to respond. In this evaluation, silence IS the expected correct behavior in at least some turns. When evaluating silence-related requirements:
- [BOT SILENCE] after a conversation closer ("cool thanks", "bet", "sounds good") is CORRECT behavior
- [BOT SILENCE] after a task acknowledgment with no follow-up question is CORRECT behavior
- A text response where silence would have been more natural should be evaluated as a potential failure
- Silence is a deliberate feature, not an error`;
    } else {
      system += `

## Silence Evaluation
The transcript may contain [BOT SILENCE] entries indicating the bot deliberately chose not to respond. In this evaluation, the bot should NOT go silent — silence would be incorrect behavior. When evaluating:
- [BOT SILENCE] when the user asked a question is a FAILURE
- [BOT SILENCE] when the user is in distress or expressing vulnerability is a FAILURE
- [BOT SILENCE] when there is an open thread requiring a response is a FAILURE
- The bot should always respond in this scenario`;
    }
  }

  // Prior session context for judge (Tier 4.4)
  if (input.priorSession) {
    system += `\n\n## Prior Session Context`;
    if (input.priorSession.history?.length) {
      const historyLines = input.priorSession.history
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n');
      system += `\nThe following conversation happened in a prior session. The bot should be aware of this context without the user needing to repeat it:\n${historyLines}`;
    }
    if (input.priorSession.coachNotes) {
      system += `\nCoach notes from prior sessions:\n${input.priorSession.coachNotes}`;
    }
    if (input.priorSession.knownContext?.length) {
      system += `\nThe bot should already know the following from prior sessions (the user deliberately did NOT mention these):`;
      for (const ctx of input.priorSession.knownContext) {
        system += `\n- ${ctx}`;
      }
      system += `\nEvaluate whether the bot correctly references or accounts for this prior context when relevant.`;
    }
  }

  // Multi-phase context for judge (Tier 4.5)
  if (input.phases?.length) {
    system += `\n\n## Multi-Phase Conversation`;
    system += `\nThis conversation spans multiple phases with different configurations. The transcript may contain [PHASE BOUNDARY] markers. Evaluate each phase's requirements in the context of its designated personality and purpose:`;
    for (let i = 0; i < input.phases.length; i++) {
      const phase = input.phases[i]!;
      system += `\n- Phase ${i + 1}: ${phase.turnLimit} turns`;
      if (phase.requirements?.length) {
        system += `\n  Phase-specific requirements: ${phase.requirements.join('; ')}`;
      }
    }
    system += `\nEvaluate both per-phase requirements and overall requirements across the full transcript. Pay attention to the quality of transitions between phases.`;
  }

  system += `

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

  if (input.judgeInstructions) {
    system += `\n\nAdditional instructions for this evaluation:\n${input.judgeInstructions}`;
  }

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
  log?: EvalLogFn,
): Promise<JudgeOutput> {
  const prompt = buildPrompt(input);

  if (!config.judge) {
    throw new Error('Judge config is required for evaluation');
  }

  log?.('info', `Judge starting evaluation`, {
    model: config.judge.model,
    requirementCount: input.requirements.length,
    specName: input.specName,
  });
  log?.('debug', 'Judge prompt built', {
    systemPromptLength: prompt.system.length,
    userPromptLength: prompt.user.length,
    model: config.judge.model,
  });

  const { text, usage } = await generateText({
    model: resolveModel(config.judge.model),
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxOutputTokens: 4096,
  });

  log?.('debug', 'Judge response received', {
    responseLength: text.length,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  });

  const parsed = parseJudgeResponse(text, input);

  // Log per-requirement results — warn if failed, info if passed
  for (const req of parsed.requirements) {
    const level = req.classification === 'failed' ? 'warn' : 'info';
    log?.(level, `Requirement ${req.classification}: ${req.description}`, {
      classification: req.classification,
      reasoning: req.reasoning,
    });
  }

  log?.('info', `Judge complete: ${parsed.classification}`, {
    classification: parsed.classification,
  });

  return {
    ...parsed,
    usage: {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    },
  };
}
