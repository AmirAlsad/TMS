import type {
  TmsConfig,
  EvalSpec,
  EvalResult,
  EvalRequirement,
  Classification,
  Message,
} from '@tms/shared';
import { runConversation, runHook, saveEvalResult, generateEvalId } from '@tms/server/services';
import type { RunOptions, SpecResult, RunReport } from './types.js';

function noopBroadcast() {
  // In headless mode, we don't broadcast to WebSocket clients
}

type EvaluateTranscriptFn = (
  config: TmsConfig,
  input: { transcript: Message[]; requirements: string[]; specName: string },
) => Promise<{ requirements: EvalRequirement[]; classification: Classification }>;

// Dynamic import for evaluator since it may not be implemented yet
async function tryEvaluateTranscript(
  config: TmsConfig,
  input: { transcript: Message[]; requirements: string[]; specName: string },
): Promise<{ requirements: EvalRequirement[]; classification: Classification }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evaluator = (await import('@tms/server/services')) as any;
    const fn = evaluator.evaluateTranscript as EvaluateTranscriptFn | undefined;
    if (typeof fn !== 'function') {
      throw new Error('evaluateTranscript not yet implemented');
    }
    return fn(config, input);
  } catch {
    // Evaluator not implemented yet — mark as needs_review
    return {
      requirements: input.requirements.map((desc) => ({
        description: desc,
        classification: 'needs_review' as const,
        reasoning: 'Evaluator not yet implemented',
      })),
      classification: 'needs_review',
    };
  }
}

async function runSingleSpec(
  spec: EvalSpec,
  specPath: string,
  config: TmsConfig,
): Promise<SpecResult> {
  const startTime = Date.now();

  const evalId = generateEvalId();
  let evalResult: EvalResult = {
    id: evalId,
    specName: spec.name,
    status: 'running',
    requirements: [],
    transcript: [],
    startedAt: new Date().toISOString(),
  };

  try {
    // Run before hook
    if (spec.hooks?.before) {
      await runHook(spec.hooks.before);
    }

    // Run conversation loop
    const conversationResult = await runConversation(config, spec, noopBroadcast);

    if (conversationResult.error) {
      throw new Error(`Conversation failed: ${conversationResult.error}`);
    }

    // Evaluate transcript
    const evaluation = await tryEvaluateTranscript(config, {
      transcript: conversationResult.transcript,
      requirements: spec.requirements,
      specName: spec.name,
    });

    evalResult = {
      ...evalResult,
      status: 'completed',
      classification: evaluation.classification,
      requirements: evaluation.requirements,
      transcript: conversationResult.transcript,
      completedAt: new Date().toISOString(),
    };

    // Persist result
    await saveEvalResult(evalResult);

    // Run after hook
    if (spec.hooks?.after) {
      await runHook(spec.hooks.after);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    evalResult = {
      ...evalResult,
      status: 'failed',
      classification: 'failed',
      error: errorMsg,
      completedAt: new Date().toISOString(),
    };
  }

  return {
    specPath,
    evalResult,
    durationMs: Date.now() - startTime,
  };
}

function computeOverallClassification(results: SpecResult[]): Classification {
  const hasFailure = results.some((r) => r.evalResult.classification === 'failed');
  if (hasFailure) return 'failed';

  const hasReview = results.some((r) => r.evalResult.classification === 'needs_review');
  if (hasReview) return 'needs_review';

  return 'passed';
}

export async function runSpecs(
  specs: Array<{ spec: EvalSpec; specPath: string }>,
  config: TmsConfig,
  options: RunOptions,
): Promise<RunReport> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  let results: SpecResult[];

  if (options.parallel && specs.length > 1) {
    results = await Promise.all(
      specs.map(({ spec, specPath }) => runSingleSpec(spec, specPath, config)),
    );
  } else {
    results = [];
    for (const { spec, specPath } of specs) {
      const result = await runSingleSpec(spec, specPath, config);
      results.push(result);
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.evalResult.classification === 'passed').length,
    failed: results.filter((r) => r.evalResult.classification === 'failed').length,
    needsReview: results.filter((r) => r.evalResult.classification === 'needs_review').length,
  };

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    results,
    summary,
    overallClassification: computeOverallClassification(results),
  };
}
