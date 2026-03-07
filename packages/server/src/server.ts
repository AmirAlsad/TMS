import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import type { TmsConfig } from '@tms/shared';
import { createMessageRouter } from './routes/messages.js';
import { createLogsRouter } from './routes/logs.js';
import { createEvalRouter } from './routes/eval.js';
import { createConfigRouter } from './routes/config.js';
import { createWhatsAppRouter } from './routes/whatsapp.js';
import { setupWebSocket } from './ws/handler.js';
import { ReadReceiptService } from './services/read-receipt.js';
import { sendStatusCallback } from './services/bot-client.js';

export function createServer(config: TmsConfig) {
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
  app.use('/api/logs', createLogsRouter(broadcast));
  app.use('/api/eval', createEvalRouter(config, broadcast));
  app.use('/api/config', createConfigRouter(config));
  app.use('/api/whatsapp', createWhatsAppRouter(config, broadcast, readReceiptService));

  return { app, server, wss };
}
