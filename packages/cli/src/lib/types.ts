import type { EvalResult, Classification } from '@tms/shared';

export interface RunOptions {
  output?: string;
  json?: boolean;
  verbose?: boolean;
  parallel?: boolean;
  config?: string;
  suite?: string;
  runs?: number;
  checkRegression?: boolean;
  /** Maximum cost budget in dollars — exit code 1 if exceeded (Tier 6.2) */
  costLimit?: number;
}

export interface SpecResult {
  specPath: string;
  evalResult: EvalResult;
  durationMs: number;
}

export interface RunReport {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  results: SpecResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    needsReview: number;
  };
  overallClassification: Classification;
}
