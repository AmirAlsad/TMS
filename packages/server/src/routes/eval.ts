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
} from '@tms/shared';
import { evalSpecSchema, mapWithConcurrency } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { runConversation } from '../services/conversation.js';
import { runHook } from '../services/hooks.js';
import { evaluateTranscript } from '../services/evaluator.js';
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
  }

  if (hasAnyMetrics) {
    botMetrics = {};
    if (totalCost > 0) botMetrics.totalCost = totalCost;
    if (totalCached > 0) botMetrics.totalCachedTokens = totalCached;
    if (totalUncached > 0) botMetrics.totalUncachedTokens = totalUncached;
    if (latencyCount > 0) botMetrics.averageLatencyMs = Math.round(latencySum / latencyCount);
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

      const conversationResult = await runConversation(config, spec, broadcast, log, evalId);
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

      const judgeOutput = await evaluateTranscript(
        config,
        {
          transcript: conversationResult.transcript,
          requirements: spec.requirements,
          specName: spec.name,
          specDescription: spec.description,
          events: conversationResult.events,
          judgeInstructions: spec.judge?.instructions,
        },
        log,
      );

      result.requirements = judgeOutput.requirements;
      result.classification = judgeOutput.classification;
      result.status = 'completed';
      result.completedAt = new Date().toISOString();

      result.tokenUsage = buildTokenUsageSummary(conversationResult, judgeOutput.usage);

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
