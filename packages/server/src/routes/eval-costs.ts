import { Router } from 'express';
import type { TmsConfig } from '@tms/shared';
import { listEvalResults } from '../services/eval-results.js';

interface CostEntry {
  specName: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  runCount: number;
}

export function createEvalCostsRouter(config: TmsConfig) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const results = await listEvalResults();
      const completedResults = results.filter((r) => r.status === 'completed' && r.tokenUsage);

      // Aggregate by spec name
      const specMap = new Map<string, CostEntry>();

      for (const result of completedResults) {
        const usage = result.tokenUsage!;
        const existing = specMap.get(result.specName);

        if (existing) {
          existing.totalPromptTokens += usage.total.promptTokens;
          existing.totalCompletionTokens += usage.total.completionTokens;
          existing.totalTokens += usage.total.totalTokens;
          existing.runCount++;
        } else {
          specMap.set(result.specName, {
            specName: result.specName,
            totalPromptTokens: usage.total.promptTokens,
            totalCompletionTokens: usage.total.completionTokens,
            totalTokens: usage.total.totalTokens,
            runCount: 1,
          });
        }
      }

      // Compute estimated costs if pricing config is present
      const entries = [...specMap.values()];

      // Overall totals
      let grandTotalPrompt = 0;
      let grandTotalCompletion = 0;
      let grandTotalTokens = 0;
      let grandTotalCost: number | undefined;

      for (const entry of entries) {
        grandTotalPrompt += entry.totalPromptTokens;
        grandTotalCompletion += entry.totalCompletionTokens;
        grandTotalTokens += entry.totalTokens;
      }

      // Compute per-spec costs using bot endpoint metrics (already tracked per result)
      if (config.pricing) {
        grandTotalCost = 0;
        for (const result of completedResults) {
          const usage = result.tokenUsage!;
          // Try to estimate cost from user bot and judge models
          const ubModel = result.configSnapshot?.userBotModel;
          const judgeModel = result.configSnapshot?.judgeModel;

          let resultCost = 0;
          if (ubModel && config.pricing[ubModel]) {
            const p = config.pricing[ubModel];
            resultCost += (usage.userBot.promptTokens / 1_000_000) * p.input;
            resultCost += (usage.userBot.completionTokens / 1_000_000) * p.output;
          }
          if (judgeModel && config.pricing[judgeModel]) {
            const p = config.pricing[judgeModel];
            resultCost += (usage.judge.promptTokens / 1_000_000) * p.input;
            resultCost += (usage.judge.completionTokens / 1_000_000) * p.output;
          }
          // Add bot endpoint cost if reported directly
          if (usage.botMetrics?.totalCost) {
            resultCost += usage.botMetrics.totalCost;
          }

          grandTotalCost += resultCost;

          // Add to per-spec entry
          const specEntry = specMap.get(result.specName);
          if (specEntry) {
            specEntry.estimatedCost = (specEntry.estimatedCost ?? 0) + resultCost;
          }
        }
      }

      res.json({
        specs: entries,
        totals: {
          promptTokens: grandTotalPrompt,
          completionTokens: grandTotalCompletion,
          totalTokens: grandTotalTokens,
          estimatedCost: grandTotalCost,
          totalRuns: completedResults.length,
        },
        hasPricing: !!config.pricing,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
