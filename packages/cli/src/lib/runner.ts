import type { TmsConfig, EvalSpec, EvalResult, Classification, BatchRun } from '@tms/shared';
import {
  runConversation,
  runHook,
  saveEvalResult,
  generateEvalId,
  evaluateTranscript,
  generateBatchId,
  saveBatchRun,
} from '@tms/server/services';
import type { RunOptions, SpecResult, RunReport } from './types.js';

function noopBroadcast() {
  // In headless mode, we don't broadcast to WebSocket clients
}

async function runSingleSpec(
  spec: EvalSpec,
  specPath: string,
  config: TmsConfig,
  batchId?: string,
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
    ...(batchId ? { batchId } : {}),
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
    const evaluation = await evaluateTranscript(config, {
      transcript: conversationResult.transcript,
      requirements: spec.requirements,
      specName: spec.name,
      specDescription: spec.description,
      events: conversationResult.events,
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
    await saveEvalResult(evalResult);
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

  // Create a BatchRun record when running multiple specs
  let batchRun: BatchRun | undefined;
  if (specs.length > 1) {
    const batchId = generateBatchId();
    batchRun = {
      id: batchId,
      label: options.suite ?? 'CLI batch',
      suiteName: options.suite,
      specNames: specs.map(({ spec }) => spec.name),
      specIds: specs.map(({ spec }) => `${generateEvalId()}_${spec.name}`),
      status: 'running',
      startedAt,
    };
    await saveBatchRun(batchRun);
  }

  if (options.parallel && specs.length > 1) {
    results = await Promise.all(
      specs.map(({ spec, specPath }) => runSingleSpec(spec, specPath, config, batchRun?.id)),
    );
  } else {
    results = [];
    for (const { spec, specPath } of specs) {
      const result = await runSingleSpec(spec, specPath, config, batchRun?.id);
      results.push(result);
    }
  }

  // Update BatchRun with actual spec IDs and completion status
  if (batchRun) {
    batchRun.specIds = results.map((r) => r.evalResult.id);
    batchRun.status = 'completed';
    batchRun.completedAt = new Date().toISOString();
    await saveBatchRun(batchRun);
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
