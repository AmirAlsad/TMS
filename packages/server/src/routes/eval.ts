import { Router } from 'express';

export function createEvalRouter() {
  const router = Router();

  router.post('/run', (_req, res) => {
    // Phase 3 placeholder
    res.status(501).json({ error: 'Evaluation not yet implemented' });
  });

  router.get('/:id', (req, res) => {
    // Phase 3 placeholder
    res.status(501).json({ error: 'Evaluation not yet implemented' });
  });

  return router;
}
