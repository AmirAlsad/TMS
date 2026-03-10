import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import type { TmsConfig } from '@tms/shared';
import { createMessageRouter } from './routes/messages.js';
import { createLogsRouter } from './routes/logs.js';
import { createEvalRouter } from './routes/eval.js';
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

  app.use('/api/message', createMessageRouter(config, broadcast, readReceiptService));
  app.use('/api/logs', createLogsRouter(broadcast, config));
  app.use('/api/eval', createEvalRouter(config, broadcast));
  app.use('/api/config', createConfigRouter(config));
  app.use('/api/whatsapp', createWhatsAppRouter(config, broadcast, readReceiptService));
  app.use('/api/media', createMediaRouter(port));

  // Serve eval assets (images, documents, contacts) for automated eval specs
  const evalsAssetsDir = path.resolve(findProjectRoot(), 'evals', 'assets');
  app.use('/api/eval-assets', express.static(evalsAssetsDir));

  return { app, server, wss, cleanupMediaDir };
}
