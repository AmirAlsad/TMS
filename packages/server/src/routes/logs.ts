import { Router } from 'express';
import { logEntrySchema } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';

export function createLogsRouter(broadcast: BroadcastFn) {
  const router = Router();

  router.post('/', (req, res) => {
    const result = logEntrySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid log entry', details: result.error.issues });
      return;
    }

    broadcast({ type: 'log:entry', payload: result.data });
    res.status(204).end();
  });

  return router;
}
