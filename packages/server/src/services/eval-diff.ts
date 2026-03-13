import type { EvalResult, EvalDiffResult, RequirementDiff } from '@tms/shared';

/**
 * Compare two eval results and produce a structured diff (Tier 6.3).
 *
 * Shows:
 * - Where the conversation transcript diverged
 * - Which requirements changed classification
 * - Token usage and cost shifts
 */
export function diffEvalResults(a: EvalResult, b: EvalResult): EvalDiffResult {
  // Find divergence point in transcripts
  const minLen = Math.min(a.transcript.length, b.transcript.length);
  let divergencePoint = -1;

  for (let i = 0; i < minLen; i++) {
    const msgA = a.transcript[i]!;
    const msgB = b.transcript[i]!;
    if (msgA.role !== msgB.role || msgA.content !== msgB.content) {
      divergencePoint = i;
      break;
    }
  }

  // If same length and all content matched, check if lengths differ
  if (divergencePoint === -1 && a.transcript.length !== b.transcript.length) {
    divergencePoint = minLen;
  }

  // Compare requirements
  const reqsA = a.requirements;
  const reqsB = b.requirements;
  const allDescs = new Set([...reqsA.map((r) => r.description), ...reqsB.map((r) => r.description)]);

  const requirementDiffs: RequirementDiff[] = [];
  for (const desc of allDescs) {
    const rA = reqsA.find((r) => r.description === desc);
    const rB = reqsB.find((r) => r.description === desc);
    requirementDiffs.push({
      description: desc,
      classificationA: rA?.classification,
      classificationB: rB?.classification,
      changed: rA?.classification !== rB?.classification,
      reasoningA: rA?.reasoning,
      reasoningB: rB?.reasoning,
    });
  }

  // Token usage delta
  let tokenUsageDelta: EvalDiffResult['tokenUsageDelta'];
  if (a.tokenUsage && b.tokenUsage) {
    tokenUsageDelta = {
      promptTokens: b.tokenUsage.total.promptTokens - a.tokenUsage.total.promptTokens,
      completionTokens:
        b.tokenUsage.total.completionTokens - a.tokenUsage.total.completionTokens,
      totalTokens: b.tokenUsage.total.totalTokens - a.tokenUsage.total.totalTokens,
    };
  }

  // Cost delta
  let costDelta: number | undefined;
  const costA = a.tokenUsage?.botMetrics?.totalCost ?? a.costBreakdown?.total;
  const costB = b.tokenUsage?.botMetrics?.totalCost ?? b.costBreakdown?.total;
  if (costA != null && costB != null) {
    costDelta = costB - costA;
  }

  return {
    specNameA: a.specName,
    specNameB: b.specName,
    idA: a.id,
    idB: b.id,
    divergencePoint,
    requirementDiffs,
    classificationA: a.classification,
    classificationB: b.classification,
    tokenUsageDelta,
    costDelta,
    transcriptLengthA: a.transcript.length,
    transcriptLengthB: b.transcript.length,
  };
}
