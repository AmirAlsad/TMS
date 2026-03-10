import { Router } from 'express';
import { logEntrySchema } from '@tms/shared';
import type { LogLevel, TmsConfig } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogsRouter(broadcast: BroadcastFn, config: TmsConfig) {
  const router = Router();

  router.post('/', (req, res) => {
    const result = logEntrySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid log entry', details: result.error.issues });
      return;
    }

    const minLevel = config.logs?.level ?? 'info';
    if (LEVEL_RANK[result.data.level] < LEVEL_RANK[minLevel]) {
      res.status(204).end();
      return;
    }

    broadcast({ type: 'log:entry', payload: result.data });
    res.status(204).end();
  });

  return router;
}
