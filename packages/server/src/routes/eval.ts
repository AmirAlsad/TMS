import { Router } from 'express';
import { parse as parseYaml } from 'yaml';
import type {
  TmsConfig,
  EvalResult,
  EvalSpec,
  TokenUsage,
  TokenUsageSummary,
  ConversationResult,
  BotEndpointSummary,
  BatchRun,
  CostBreakdown,
  ABVariantConfig,
} from '@tms/shared';
import { evalSpecSchema, mapWithConcurrency } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { runConversation, runMultiPhaseConversation } from '../services/conversation.js';
import { runHook } from '../services/hooks.js';
import { evaluateTranscript } from '../services/evaluator.js';
import { generateABReport } from '../services/ab-report.js';
import { diffEvalResults } from '../services/eval-diff.js';
import {
  saveEvalResult,
  getEvalResult,
  listEvalResults,
  generateEvalId,
} from '../services/eval-results.js';
import { createEvalLogger } from '../services/eval-logger.js';
import { loadEvalSpec, listEvalSpecs } from '../services/eval-spec-loader.js';
import { loadEvalSuite, listEvalSuites } from '../services/suite-loader.js';
import {
  generateBatchId,
  saveBatchRun,
  getBatchRun,
  listBatchRuns,
} from '../services/batch-runs.js';
import {
  getSpecHistory,
  getAllSpecHistories,
  setBaseline,
  getAllBaselines,
} from '../services/eval-history.js';

let activeEvals = 0;
let maxConcurrentEvals = 3; // Will be overridden from config

function acquireEvalSlot(): boolean {
  if (activeEvals >= maxConcurrentEvals) return false;
  activeEvals++;
  return true;
}

function releaseEvalSlot(): void {
  activeEvals = Math.max(0, activeEvals - 1);
}

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function buildTokenUsageSummary(
  conversationResult: ConversationResult,
  judgeUsage?: TokenUsage,
): TokenUsageSummary {
  const botEndpointTotal: TokenUsage = { ...ZERO_USAGE };
  for (const t of conversationResult.turnUsages) {
    if (t.botEndpoint) {
      botEndpointTotal.promptTokens += t.botEndpoint.promptTokens;
      botEndpointTotal.completionTokens += t.botEndpoint.completionTokens;
      botEndpointTotal.totalTokens += t.botEndpoint.totalTokens;
    }
  }

  const ub = conversationResult.userBotTotal;
  const ju = judgeUsage ?? ZERO_USAGE;
  const be = botEndpointTotal;

  // Aggregate bot endpoint metrics (cost, cached tokens, latency)
  let botMetrics: BotEndpointSummary | undefined;
  let totalCost = 0;
  let totalCached = 0;
  let totalUncached = 0;
  let latencySum = 0;
  let latencyCount = 0;
  let hasAnyMetrics = false;

  // Prompt cache metric aggregation (Tier 7.2)
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  for (const t of conversationResult.turnUsages) {
    if (!t.botMetrics) continue;
    hasAnyMetrics = true;
    if (t.botMetrics.cost != null) totalCost += t.botMetrics.cost;
    if (t.botMetrics.cachedTokens != null) totalCached += t.botMetrics.cachedTokens;
    if (t.botMetrics.uncachedTokens != null) totalUncached += t.botMetrics.uncachedTokens;
    if (t.botMetrics.latencyMs != null) {
      latencySum += t.botMetrics.latencyMs;
      latencyCount++;
    }
    if (t.botMetrics.cacheCreationInputTokens != null)
      totalCacheCreation += t.botMetrics.cacheCreationInputTokens;
    if (t.botMetrics.cacheReadInputTokens != null)
      totalCacheRead += t.botMetrics.cacheReadInputTokens;
  }

  if (hasAnyMetrics) {
    botMetrics = {};
    if (totalCost > 0) botMetrics.totalCost = totalCost;
    if (totalCached > 0) botMetrics.totalCachedTokens = totalCached;
    if (totalUncached > 0) botMetrics.totalUncachedTokens = totalUncached;
    if (latencyCount > 0) botMetrics.averageLatencyMs = Math.round(latencySum / latencyCount);
    if (totalCacheCreation > 0) botMetrics.totalCacheCreationInputTokens = totalCacheCreation;
    if (totalCacheRead > 0) botMetrics.totalCacheReadInputTokens = totalCacheRead;
    const cacheTotal = totalCacheCreation + totalCacheRead;
    if (cacheTotal > 0) botMetrics.cacheHitRate = totalCacheRead / cacheTotal;
  }

  return {
    userBot: ub,
    judge: ju,
    botEndpoint: be,
    total: {
      promptTokens: ub.promptTokens + ju.promptTokens + be.promptTokens,
      completionTokens: ub.completionTokens + ju.completionTokens + be.completionTokens,
      totalTokens: ub.totalTokens + ju.totalTokens + be.totalTokens,
    },
    botMetrics,
  };
}

/**
 * Compute per-system cost breakdown (Tier 4.6).
 * Uses pricing config for user bot and judge models, plus bot endpoint reported costs.
 */
function computeCostBreakdown(
  tokenUsage: TokenUsageSummary,
  config: TmsConfig,
  configSnapshot?: { userBotModel?: string; judgeModel?: string },
): CostBreakdown | undefined {
  if (!config.pricing) return undefined;

  let userBotCost = 0;
  let judgeCost = 0;
  let botEndpointCost = 0;

  // User bot cost from pricing config
  const ubModel = configSnapshot?.userBotModel;
  if (ubModel && config.pricing[ubModel]) {
    const p = config.pricing[ubModel]!;
    userBotCost = (tokenUsage.userBot.promptTokens / 1_000_000) * p.input
      + (tokenUsage.userBot.completionTokens / 1_000_000) * p.output;
  }

  // Judge cost from pricing config
  const judgeModel = configSnapshot?.judgeModel;
  if (judgeModel && config.pricing[judgeModel]) {
    const p = config.pricing[judgeModel]!;
    judgeCost = (tokenUsage.judge.promptTokens / 1_000_000) * p.input
      + (tokenUsage.judge.completionTokens / 1_000_000) * p.output;
  }

  // Bot endpoint cost from reported metrics
  if (tokenUsage.botMetrics?.totalCost) {
    botEndpointCost = tokenUsage.botMetrics.totalCost;
  }

  const total = userBotCost + judgeCost + botEndpointCost;

  // Only return if we have any meaningful cost data
  if (total === 0 && !tokenUsage.botMetrics?.totalCost) return undefined;

  return {
    userBot: userBotCost > 0 ? userBotCost : undefined,
    botEndpoint: botEndpointCost > 0 ? botEndpointCost : undefined,
    judge: judgeCost > 0 ? judgeCost : undefined,
    total,
  };
}

function parseSpec(body: Record<string, unknown>): EvalSpec {
  let rawSpec: unknown;
  if (typeof body.yaml === 'string') {
    rawSpec = parseYaml(body.yaml);
  } else if (body.spec && typeof body.spec === 'object') {
    rawSpec = body.spec;
  } else {
    rawSpec = body;
  }
  return evalSpecSchema.parse(rawSpec);
}

async function executeEval(
  spec: EvalSpec,
  evalId: string,
  config: TmsConfig,
  broadcast: BroadcastFn,
  batchId?: string,
): Promise<void> {
  if (!acquireEvalSlot()) {
    const result: EvalResult = {
      id: evalId,
      specName: spec.name,
      status: 'failed',
      requirements: spec.requirements.map((r) => ({ description: r })),
      transcript: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: 'Too many concurrent evaluations. Try again later.',
      ...(batchId ? { batchId } : {}),
    };
    await saveEvalResult(result);
    broadcast({ type: 'eval:result', payload: result });
    return;
  }

  try {
    const result: EvalResult = {
      id: evalId,
      specName: spec.name,
      status: 'running',
      requirements: spec.requirements.map((r) => ({ description: r })),
      transcript: [],
      startedAt: new Date().toISOString(),
      ...(batchId ? { batchId } : {}),
      configSnapshot: {
        userBotModel: config.userBot?.model,
        judgeModel: config.judge?.model,
        botEndpoint: config.bot.endpoint,
      },
    };

    await saveEvalResult(result);
    broadcast({ type: 'eval:started', payload: result });

    const log = createEvalLogger(broadcast, config);

    log('info', `Eval started: ${spec.name}`, {
      evalId,
      specName: spec.name,
      channel: spec.channel,
      requirements: spec.requirements,
      turnLimit: spec.turnLimit,
    });

    try {
      if (spec.hooks?.before) {
        log('debug', `Running before hook`, { hook: spec.hooks.before });
        await runHook(spec.hooks.before);
        log('debug', `Before hook completed`);
      }

      // Use multi-phase conversation loop if phases are defined (Tier 4.5)
      const conversationResult = spec.phases?.length
        ? await runMultiPhaseConversation(config, spec, spec.phases, broadcast, log, evalId)
        : await runConversation(config, spec, broadcast, log, evalId);
      result.transcript = conversationResult.transcript;

      log('info', `Conversation completed`, {
        turnCount: conversationResult.turnCount,
        goalCompleted: conversationResult.goalCompleted,
      });

      if (conversationResult.error) {
        log('error', `Conversation failed: ${conversationResult.error}`);
        result.status = 'failed';
        result.error = conversationResult.error;
        result.completedAt = new Date().toISOString();
        result.tokenUsage = buildTokenUsageSummary(conversationResult);
        await saveEvalResult(result);
        broadcast({ type: 'eval:result', payload: result });
        return;
      }

      if (spec.hooks?.after) {
        log('debug', `Running after hook`, { hook: spec.hooks.after });
        await runHook(spec.hooks.after);
        log('debug', `After hook completed`);
      }

      // Collect all requirements including phase-specific ones (Tier 4.5)
      const allRequirements = [...spec.requirements];
      if (spec.phases?.length) {
        for (const phase of spec.phases) {
          if (phase.requirements?.length) {
            allRequirements.push(...phase.requirements);
          }
        }
      }

      const judgeOutput = await evaluateTranscript(
        config,
        {
          transcript: conversationResult.transcript,
          requirements: allRequirements,
          specName: spec.name,
          specDescription: spec.description,
          events: conversationResult.events,
          judgeInstructions: spec.judge?.instructions,
          silenceExpected: spec.silenceExpected,
          priorSession: spec.priorSession,
          phases: spec.phases,
        },
        log,
      );

      result.requirements = judgeOutput.requirements;
      result.classification = judgeOutput.classification;
      result.status = 'completed';
      result.completedAt = new Date().toISOString();

      result.tokenUsage = buildTokenUsageSummary(conversationResult, judgeOutput.usage);

      // Compute cost breakdown (Tier 4.6)
      const costBreakdown = computeCostBreakdown(
        result.tokenUsage,
        config,
        result.configSnapshot,
      );
      if (costBreakdown) {
        result.tokenUsage.costBreakdown = costBreakdown;
        result.costBreakdown = costBreakdown;
      }

      // Enforce cost budget (Tier 4.6)
      if (spec.costBudget != null && costBreakdown) {
        if (costBreakdown.total > spec.costBudget) {
          result.budgetExceeded = true;
          result.classification = 'failed';
          log?.('warn', `Cost budget exceeded: $${costBreakdown.total.toFixed(4)} > $${spec.costBudget.toFixed(4)}`, {
            costTotal: costBreakdown.total,
            costBudget: spec.costBudget,
          });
        }
      }

      log('info', `Eval complete: ${spec.name} — ${judgeOutput.classification}`, {
        evalId,
        specName: spec.name,
        classification: judgeOutput.classification,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      log('error', `Eval failed: ${spec.name} — ${errorMsg}`, { evalId, error: errorMsg });
      result.status = 'failed';
      result.error = errorMsg;
      result.completedAt = new Date().toISOString();
    }

    await saveEvalResult(result);
    broadcast({ type: 'eval:result', payload: result });
  } finally {
    releaseEvalSlot();
  }
}

function generateSpecEvalId(): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${generateEvalId()}_${suffix}`;
}

async function runBatch(
  specNames: string[],
  config: TmsConfig,
  broadcast: BroadcastFn,
  options: { parallel?: boolean; suiteName?: string; label?: string; maxConcurrency?: number },
): Promise<{ batchRun: BatchRun; ids: string[] }> {
  const loadedSpecs: EvalSpec[] = [];
  for (const name of specNames) {
    loadedSpecs.push(await loadEvalSpec(name));
  }

  const batchId = generateBatchId();
  const ids = loadedSpecs.map(() => generateSpecEvalId());

  const parallel = !!options.parallel;
  const batchRun: BatchRun = {
    id: batchId,
    label: options.label ?? options.suiteName ?? 'Ad-hoc batch',
    suiteName: options.suiteName,
    specNames: loadedSpecs.map((s) => s.name),
    specIds: ids,
    status: 'running',
    startedAt: new Date().toISOString(),
    parallel,
  };

  await saveBatchRun(batchRun);
  broadcast({ type: 'batch:started', payload: batchRun });

  console.log(
    `Batch "${batchRun.label}" starting ${parallel ? 'parallel' : 'sequential'}, ${loadedSpecs.length} specs`,
  );

  const execute = async () => {
    const run = (spec: EvalSpec, id: string) =>
      executeEval(spec, id, config, broadcast, batchId).catch((err) =>
        console.error(`Batch eval for ${spec.name} failed:`, err),
      );

    if (parallel) {
      const concurrency = options.maxConcurrency ?? config.server?.maxConcurrency ?? 5;
      await mapWithConcurrency(loadedSpecs, (spec, i) => run(spec, ids[i]!), concurrency);
    } else {
      for (let i = 0; i < loadedSpecs.length; i++) {
        await run(loadedSpecs[i]!, ids[i]!);
      }
    }

    batchRun.status = 'completed';
    batchRun.completedAt = new Date().toISOString();
    await saveBatchRun(batchRun);
    broadcast({ type: 'batch:completed', payload: batchRun });
  };

  execute().catch((err) => {
    console.error('Batch execution failed:', err);
    batchRun.status = 'failed';
    batchRun.completedAt = new Date().toISOString();
    saveBatchRun(batchRun).catch(() => {});
    broadcast({ type: 'batch:completed', payload: batchRun });
  });

  return { batchRun, ids };
}

export function createEvalRouter(config: TmsConfig, broadcast: BroadcastFn) {
  maxConcurrentEvals = config.server?.maxConcurrentEvals ?? 3;
  const router = Router();

  router.get('/specs', async (_req, res) => {
    try {
      const specs = await listEvalSpecs();
      res.json({ specs });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/suites', async (_req, res) => {
    try {
      const suites = await listEvalSuites();
      res.json({ suites });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/suites/:name', async (req, res) => {
    try {
      const suite = await loadEvalSuite(req.params.name);
      res.json(suite);
    } catch {
      res.status(404).json({ error: `Suite "${req.params.name}" not found` });
    }
  });

  router.post('/run', async (req, res) => {
    try {
      let spec: EvalSpec;

      if (typeof req.body.spec === 'string') {
        spec = await loadEvalSpec(req.body.spec);
      } else {
        spec = parseSpec(req.body);
      }

      const evalId = generateEvalId();
      res.json({ id: evalId, status: 'running' });

      executeEval(spec, evalId, config, broadcast).catch((err) => {
        console.error(`Eval ${evalId} failed:`, err);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  router.post('/comparative', async (req, res) => {
    const { spec, runs, parallel } = req.body;

    if (typeof spec !== 'string' || !spec) {
      res.status(400).json({ error: 'spec must be a non-empty string' });
      return;
    }

    const runCount = typeof runs === 'number' ? Math.min(Math.max(Math.round(runs), 2), 20) : 5;
    const specNames = Array.from({ length: runCount }, () => spec);

    try {
      const { batchRun, ids } = await runBatch(specNames, config, broadcast, {
        parallel: !!parallel,
        label: `Comparative: ${spec} (x${runCount})`,
      });

      batchRun.comparativeSpec = spec;
      batchRun.runCount = runCount;
      await saveBatchRun(batchRun);

      // Re-broadcast updated batch with comparative fields
      broadcast({ type: 'batch:started', payload: batchRun });

      res.json({ batchId: batchRun.id, ids, spec, runs: runCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  router.post('/batch', async (req, res) => {
    const { specs, parallel, maxConcurrency } = req.body;

    if (!Array.isArray(specs) || specs.length === 0) {
      res.status(400).json({ error: 'specs must be a non-empty array of spec names' });
      return;
    }

    for (const specName of specs) {
      if (typeof specName !== 'string') {
        res.status(400).json({ error: 'Each spec must be a string name' });
        return;
      }
    }

    try {
      const { batchRun, ids } = await runBatch(specs, config, broadcast, {
        parallel: !!parallel,
        maxConcurrency,
      });
      res.json({ batchId: batchRun.id, ids });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  router.post('/suite/:name', async (req, res) => {
    try {
      const suite = await loadEvalSuite(req.params.name);
      const { batchRun, ids } = await runBatch(suite.specs, config, broadcast, {
        parallel: !!req.body.parallel,
        suiteName: suite.name,
        label: suite.name,
        maxConcurrency: req.body.maxConcurrency,
      });
      res.json({ batchId: batchRun.id, ids, suite: suite.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.get('/batches', async (_req, res) => {
    try {
      const runs = await listBatchRuns();
      res.json({ runs });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/batches/:id', async (req, res) => {
    try {
      const run = await getBatchRun(req.params.id);
      if (!run) {
        res.status(404).json({ error: 'Batch run not found' });
        return;
      }
      res.json(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      const window = req.query.window ? Number(req.query.window) : 5;
      const histories = await getAllSpecHistories(window);
      res.json({ histories });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/history/:specName', async (req, res) => {
    try {
      const window = req.query.window ? Number(req.query.window) : 5;
      const history = await getSpecHistory(req.params.specName, window);
      res.json(history);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // --- A/B Test endpoint (Tier 4.3) ---
  router.post('/ab-test', async (req, res) => {
    const { variantA, variantB, parallel } = req.body as {
      variantA?: ABVariantConfig;
      variantB?: ABVariantConfig;
      parallel?: boolean;
    };

    if (!variantA?.label || !variantA?.specs?.length) {
      res.status(400).json({ error: 'variantA must have a label and non-empty specs array' });
      return;
    }
    if (!variantB?.label || !variantB?.specs?.length) {
      res.status(400).json({ error: 'variantB must have a label and non-empty specs array' });
      return;
    }

    try {
      // Build variant-specific configs by overriding bot endpoint/headers
      const configA: TmsConfig = variantA.botEndpoint || variantA.botHeaders
        ? {
            ...config,
            bot: {
              ...config.bot,
              ...(variantA.botEndpoint ? { endpoint: variantA.botEndpoint } : {}),
              ...(variantA.botHeaders
                ? { headers: { ...config.bot.headers, ...variantA.botHeaders } }
                : {}),
            },
          }
        : config;

      const configB: TmsConfig = variantB.botEndpoint || variantB.botHeaders
        ? {
            ...config,
            bot: {
              ...config.bot,
              ...(variantB.botEndpoint ? { endpoint: variantB.botEndpoint } : {}),
              ...(variantB.botHeaders
                ? { headers: { ...config.bot.headers, ...variantB.botHeaders } }
                : {}),
            },
          }
        : config;

      // Run variant A
      const { batchRun: batchA, ids: idsA } = await runBatch(
        variantA.specs,
        configA,
        broadcast,
        {
          parallel: !!parallel,
          label: `A/B Variant A: ${variantA.label}`,
        },
      );
      batchA.abLabel = variantA.label;
      await saveBatchRun(batchA);

      // Run variant B
      const { batchRun: batchB, ids: idsB } = await runBatch(
        variantB.specs,
        configB,
        broadcast,
        {
          parallel: !!parallel,
          label: `A/B Variant B: ${variantB.label}`,
        },
      );
      batchB.abLabel = variantB.label;
      await saveBatchRun(batchB);

      res.json({
        variantA: { batchId: batchA.id, ids: idsA, label: variantA.label },
        variantB: { batchId: batchB.id, ids: idsB, label: variantB.label },
        message: 'A/B test started. Use GET /api/eval/ab-test/:batchIdA/:batchIdB to get the report when both batches complete.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  // A/B test report — compare two completed batches
  router.get('/ab-test/:batchIdA/:batchIdB', async (req, res) => {
    try {
      const batchA = await getBatchRun(req.params.batchIdA);
      const batchB = await getBatchRun(req.params.batchIdB);

      if (!batchA) {
        res.status(404).json({ error: `Batch A "${req.params.batchIdA}" not found` });
        return;
      }
      if (!batchB) {
        res.status(404).json({ error: `Batch B "${req.params.batchIdB}" not found` });
        return;
      }

      if (batchA.status !== 'completed' || batchB.status !== 'completed') {
        res.status(400).json({
          error: 'Both batches must be completed to generate an A/B report',
          statusA: batchA.status,
          statusB: batchB.status,
        });
        return;
      }

      // Load all eval results for both batches
      const allResults = await listEvalResults();
      const resultsA = allResults.filter((r) => batchA.specIds.includes(r.id));
      const resultsB = allResults.filter((r) => batchB.specIds.includes(r.id));

      const report = generateABReport(
        batchA.abLabel ?? batchA.label,
        batchA.id,
        resultsA,
        batchB.abLabel ?? batchB.label,
        batchB.id,
        resultsB,
      );

      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Baseline management
  router.get('/baselines', async (_req, res) => {
    try {
      const baselines = await getAllBaselines();
      res.json({ baselines });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.post('/:id/baseline', async (req, res) => {
    try {
      const result = await getEvalResult(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Eval result not found' });
        return;
      }
      if (result.status !== 'completed') {
        res.status(400).json({ error: 'Can only set baseline from completed eval results' });
        return;
      }
      await setBaseline(result.specName, result.id);
      res.json({ specName: result.specName, baselineId: result.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // --- Eval diff endpoint (Tier 6.3) ---
  router.post('/diff', async (req, res) => {
    const { idA, idB } = req.body;

    if (typeof idA !== 'string' || typeof idB !== 'string') {
      res.status(400).json({ error: 'idA and idB are required string fields' });
      return;
    }

    try {
      const resultA = await getEvalResult(idA);
      const resultB = await getEvalResult(idB);

      if (!resultA) {
        res.status(404).json({ error: `Eval result "${idA}" not found` });
        return;
      }
      if (!resultB) {
        res.status(404).json({ error: `Eval result "${idB}" not found` });
        return;
      }

      const diff = diffEvalResults(resultA, resultB);
      res.json(diff);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // --- Eval replay endpoint (Tier 6.4) ---
  router.post('/replay', async (req, res) => {
    const { evalId, pacingMs } = req.body;

    if (typeof evalId !== 'string') {
      res.status(400).json({ error: 'evalId is a required string field' });
      return;
    }

    try {
      const result = await getEvalResult(evalId);
      if (!result) {
        res.status(404).json({ error: `Eval result "${evalId}" not found` });
        return;
      }

      if (result.transcript.length === 0) {
        res.status(400).json({ error: 'Eval has no transcript to replay' });
        return;
      }

      const delay = typeof pacingMs === 'number' && pacingMs > 0 ? pacingMs : 500;

      // Respond immediately, then replay asynchronously
      res.json({
        ok: true,
        evalId,
        messageCount: result.transcript.length,
        pacingMs: delay,
      });

      // Broadcast replay:started
      broadcast({ type: 'replay:started', payload: { evalId, pacingMs: delay } });

      // Replay messages with pacing
      for (let i = 0; i < result.transcript.length; i++) {
        const msg = result.transcript[i]!;
        await new Promise((resolve) => setTimeout(resolve, delay));
        broadcast({
          type: 'replay:message',
          payload: { ...msg, replayIndex: i, replayTotal: result.transcript.length },
        });
        // Also broadcast as normal message so it appears in the UI
        const wsType = msg.role === 'user' ? 'user:message' : 'bot:message';
        broadcast({ type: wsType, payload: msg });
      }

      broadcast({
        type: 'replay:completed',
        payload: { evalId, messageCount: result.transcript.length },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const result = await getEvalResult(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Eval result not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/', async (_req, res) => {
    try {
      const results = await listEvalResults();
      res.json({ results });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
