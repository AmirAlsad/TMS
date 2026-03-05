import { Router } from 'express';
import type { TmsConfig } from '@tms/shared';

export function createConfigRouter(config: TmsConfig) {
  const router = Router();

  let currentConfig = { ...config };

  router.get('/', (_req, res) => {
    res.json(currentConfig);
  });

  router.put('/', (req, res) => {
    currentConfig = { ...currentConfig, ...req.body };
    res.json(currentConfig);
  });

  return router;
}
