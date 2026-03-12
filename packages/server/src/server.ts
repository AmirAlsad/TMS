import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import type { TmsConfig } from '@tms/shared';
import { createMessageRouter } from './routes/messages.js';
import { createLogsRouter } from './routes/logs.js';
import { createEvalRouter } from './routes/eval.js';
import { createEvalCostsRouter } from './routes/eval-costs.js';
import { createConfigRouter } from './routes/config.js';
import { createWhatsAppRouter } from './routes/whatsapp.js';
import { createMediaRouter, ensureMediaDir, cleanupMediaDir } from './routes/media.js';
import { setupWebSocket } from './ws/handler.js';
import { ReadReceiptService } from './services/read-receipt.js';
import { sendStatusCallback } from './services/bot-client.js';
import { findProjectRoot } from './services/project-root.js';

export function createServer(config: TmsConfig) {
  ensureMediaDir();

  const port = config.server?.port ?? 4000;
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const broadcast = setupWebSocket(wss);

  const readReceiptConfig = config.whatsapp?.readReceipts ?? { mode: 'on_response' as const };
  const readReceiptService = new ReadReceiptService(readReceiptConfig, broadcast, (messageId) => {
    sendStatusCallback(config, messageId, 'read').catch(() => {});
  });

  // Simple in-memory rate limiter
  function createRateLimiter(maxRequests: number, windowMs: number) {
    const hits = new Map<string, { count: number; resetAt: number }>();

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const key = req.ip ?? 'unknown';
      const now = Date.now();
      const entry = hits.get(key);

      if (!entry || now > entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        next();
        return;
      }

      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({ error: 'Too many requests', retryAfter });
        return;
      }

      entry.count++;
      next();
    };
  }

  app.use('/api/message', createRateLimiter(100, 60_000), createMessageRouter(config, broadcast, readReceiptService));
  app.use('/api/logs', createRateLimiter(500, 60_000), createLogsRouter(broadcast, config));
  app.use('/api/eval/costs', createEvalCostsRouter(config));
  app.use('/api/eval', createEvalRouter(config, broadcast));
  app.use('/api/config', createConfigRouter(config));
  app.use('/api/whatsapp', createWhatsAppRouter(config, broadcast, readReceiptService));
  app.use('/api/media', createMediaRouter(port));

  // Serve eval assets (images, documents, contacts) for automated eval specs
  const evalsAssetsDir = path.resolve(findProjectRoot(), 'evals', 'assets');
  app.use('/api/eval-assets', express.static(evalsAssetsDir));

  return { app, server, wss, cleanupMediaDir };
}
