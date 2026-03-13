import type {
  EvalResult,
  ABTestReport,
  ABRequirementDiff,
  TokenUsage,
} from '@tms/shared';

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function computePassRate(results: EvalResult[]): number {
  const completed = results.filter((r) => r.status === 'completed');
  if (completed.length === 0) return 0;
  const passed = completed.filter((r) => r.classification === 'passed').length;
  return passed / completed.length;
}

function computeTotalCost(results: EvalResult[]): number | undefined {
  let total = 0;
  let hasCost = false;
  for (const r of results) {
    if (r.costBreakdown?.total != null) {
      total += r.costBreakdown.total;
      hasCost = true;
    } else if (r.tokenUsage?.botMetrics?.totalCost != null) {
      total += r.tokenUsage.botMetrics.totalCost;
      hasCost = true;
    }
  }
  return hasCost ? total : undefined;
}

function computeTotalTokenUsage(results: EvalResult[]): TokenUsage {
  let total: TokenUsage = { ...ZERO_USAGE };
  for (const r of results) {
    if (r.tokenUsage) {
      total = addUsage(total, r.tokenUsage.total);
    }
  }
  return total;
}

/**
 * Compute per-requirement pass rates from a set of eval results.
 * Returns a map of requirement description -> { passed, total }.
 */
function computeRequirementRates(
  results: EvalResult[],
): Map<string, { passed: number; total: number }> {
  const rates = new Map<string, { passed: number; total: number }>();
  for (const r of results) {
    if (r.status !== 'completed') continue;
    for (const req of r.requirements) {
      const key = req.description;
      const existing = rates.get(key) ?? { passed: 0, total: 0 };
      existing.total++;
      if (req.classification === 'passed') existing.passed++;
      rates.set(key, existing);
    }
  }
  return rates;
}

/**
 * Generate an A/B test comparison report from two sets of eval results.
 */
export function generateABReport(
  variantALabel: string,
  variantABatchId: string,
  variantAResults: EvalResult[],
  variantBLabel: string,
  variantBBatchId: string,
  variantBResults: EvalResult[],
): ABTestReport {
  const aPassRate = computePassRate(variantAResults);
  const bPassRate = computePassRate(variantBResults);

  const aCost = computeTotalCost(variantAResults);
  const bCost = computeTotalCost(variantBResults);

  const aUsage = computeTotalTokenUsage(variantAResults);
  const bUsage = computeTotalTokenUsage(variantBResults);

  // Compute per-requirement diffs
  const aRates = computeRequirementRates(variantAResults);
  const bRates = computeRequirementRates(variantBResults);

  const allRequirements = new Set([...aRates.keys(), ...bRates.keys()]);
  const requirementDiffs: ABRequirementDiff[] = [];

  for (const desc of allRequirements) {
    const aRate = aRates.get(desc);
    const bRate = bRates.get(desc);
    const aPassRateReq = aRate ? aRate.passed / aRate.total : 0;
    const bPassRateReq = bRate ? bRate.passed / bRate.total : 0;
    requirementDiffs.push({
      description: desc,
      variantAPassRate: aPassRateReq,
      variantBPassRate: bPassRateReq,
      delta: bPassRateReq - aPassRateReq,
    });
  }

  // Sort by absolute delta descending (biggest changes first)
  requirementDiffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    variantA: {
      label: variantALabel,
      batchId: variantABatchId,
      passRate: aPassRate,
      totalRuns: variantAResults.filter((r) => r.status === 'completed').length,
      totalCost: aCost,
    },
    variantB: {
      label: variantBLabel,
      batchId: variantBBatchId,
      passRate: bPassRate,
      totalRuns: variantBResults.filter((r) => r.status === 'completed').length,
      totalCost: bCost,
    },
    passRateDelta: bPassRate - aPassRate,
    requirementDiffs,
    tokenUsageDelta: {
      promptTokens: bUsage.promptTokens - aUsage.promptTokens,
      completionTokens: bUsage.completionTokens - aUsage.completionTokens,
      totalTokens: bUsage.totalTokens - aUsage.totalTokens,
    },
    costDelta: aCost != null && bCost != null ? bCost - aCost : undefined,
  };
}
