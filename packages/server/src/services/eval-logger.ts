import type { LogLevel, TmsConfig } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export type EvalLogFn = (
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
) => void;

export function createEvalLogger(broadcast: BroadcastFn, config: TmsConfig): EvalLogFn {
  const minLevel = config.logs?.level ?? 'info';
  const minRank = LEVEL_RANK[minLevel];

  return (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (LEVEL_RANK[level] < minRank) return;

    broadcast({
      type: 'log:entry',
      payload: {
        timestamp: new Date().toISOString(),
        level,
        source: 'tms',
        message,
        ...(data !== undefined && { data }),
      },
    });
  };
}
