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
} from '@tms/shared';
import { evalSpecSchema } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { runConversation } from '../services/conversation.js';
import { runHook } from '../services/hooks.js';
import { evaluateTranscript } from '../services/evaluator.js';
import { saveEvalResult, getEvalResult, listEvalResults, generateEvalId } from '../services/eval-results.js';
import { loadEvalSpec, listEvalSpecs } from '../services/eval-spec-loader.js';

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
  } else if (typeof body.spec === 'string') {
    // Will be handled by loadEvalSpec in the caller
    throw new Error('LOAD_BY_NAME');
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
): Promise<void> {
  const result: EvalResult = {
    id: evalId,
    specName: spec.name,
    status: 'running',
    requirements: spec.requirements.map((r) => ({ description: r })),
    transcript: [],
    startedAt: new Date().toISOString(),
  };

  await saveEvalResult(result);
  broadcast({ type: 'eval:started', payload: result });

  try {
    if (spec.hooks?.before) {
      await runHook(spec.hooks.before);
    }

    const conversationResult = await runConversation(config, spec, broadcast);
    result.transcript = conversationResult.transcript;

    if (conversationResult.error) {
      result.status = 'failed';
      result.error = conversationResult.error;
      result.completedAt = new Date().toISOString();
      result.tokenUsage = buildTokenUsageSummary(conversationResult);
      await saveEvalResult(result);
      broadcast({ type: 'eval:result', payload: result });
      return;
    }

    if (spec.hooks?.after) {
      await runHook(spec.hooks.after);
    }

    const judgeOutput = await evaluateTranscript(config, {
      transcript: conversationResult.transcript,
      requirements: spec.requirements,
      specName: spec.name,
      specDescription: spec.description,
    });

    result.requirements = judgeOutput.requirements;
    result.classification = judgeOutput.classification;
    result.status = 'completed';
    result.completedAt = new Date().toISOString();

    result.tokenUsage = buildTokenUsageSummary(conversationResult, judgeOutput.usage);
  } catch (err) {
    result.status = 'failed';
    result.error = err instanceof Error ? err.message : 'Unknown error';
    result.completedAt = new Date().toISOString();
  }

  await saveEvalResult(result);
  broadcast({ type: 'eval:result', payload: result });
}

export function createEvalRouter(config: TmsConfig, broadcast: BroadcastFn) {
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

  router.post('/batch', async (req, res) => {
    const { specs } = req.body;

    if (!Array.isArray(specs) || specs.length === 0) {
      res.status(400).json({ error: 'specs must be a non-empty array of spec names' });
      return;
    }

    try {
      const loadedSpecs: EvalSpec[] = [];
      for (const specName of specs) {
        if (typeof specName !== 'string') {
          res.status(400).json({ error: 'Each spec must be a string name' });
          return;
        }
        loadedSpecs.push(await loadEvalSpec(specName));
      }

      const ids: string[] = loadedSpecs.map((_, i) => {
        const id = generateEvalId();
        return i === 0 ? id : `${id}_${i}`;
      });
      res.json({ ids });

      (async () => {
        for (let i = 0; i < loadedSpecs.length; i++) {
          try {
            await executeEval(loadedSpecs[i]!, ids[i]!, config, broadcast);
          } catch (err) {
            console.error(`Batch eval for ${loadedSpecs[i]!.name} failed:`, err);
          }
        }
      })().catch((err) => {
        console.error('Batch eval failed:', err);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).json({ error: message });
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
