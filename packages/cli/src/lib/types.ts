import type { EvalResult, Classification } from '@tms/shared';

export interface RunOptions {
  output?: string;
  json?: boolean;
  verbose?: boolean;
  parallel?: boolean;
  config?: string;
  suite?: string;
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
