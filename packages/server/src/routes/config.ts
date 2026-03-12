import { Router } from 'express';
import type { TmsConfig } from '@tms/shared';
import { tmsConfigSchema } from '@tms/shared';
import { ZodError } from 'zod';

export function createConfigRouter(config: TmsConfig) {
  const router = Router();

  let currentConfig = { ...config };

  router.get('/', (_req, res) => {
    res.json(currentConfig);
  });

  router.put('/', (req, res) => {
    const merged = { ...currentConfig, ...req.body };
    try {
      tmsConfigSchema.parse(merged);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Invalid config', details: err.errors });
        return;
      }
      throw err;
    }
    currentConfig = merged;
    res.json(currentConfig);
  });

  return router;
}
