import { generateText } from 'ai';
import type { Message, TmsConfig, EvalRequirement, Classification } from '@tms/shared';
import { resolveModel } from './ai-registry.js';

export interface JudgeInput {
  transcript: Message[];
  requirements: string[];
  specName: string;
}

export interface JudgeOutput {
  requirements: EvalRequirement[];
  classification: Classification;
}

const CLASSIFICATION_RANK: Record<Classification, number> = {
  passed: 0,
  needs_review: 1,
  failed: 2,
};

const RANK_TO_CLASSIFICATION: Classification[] = ['passed', 'needs_review', 'failed'];

function buildPrompt(input: JudgeInput): { system: string; user: string } {
  const transcriptText = input.transcript
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n');

  const requirementsList = input.requirements
    .map((r, i) => `${i + 1}. ${r}`)
    .join('\n');

  const system = `You are a QA judge evaluating a conversation between a user and a bot.
You will be given a conversation transcript and a list of requirements.
For each requirement, classify it as one of: "passed", "needs_review", or "failed".
Provide brief reasoning for each classification.

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

function parseJudgeResponse(text: string, input: JudgeInput): JudgeOutput {
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

  const { text } = await generateText({
    model: resolveModel(config.judge.model),
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxOutputTokens: 4096,
  });

  return parseJudgeResponse(text, input);
}
