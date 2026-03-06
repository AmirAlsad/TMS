import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import type { TmsConfig } from '@tms/shared';
import { createMessageRouter } from './routes/messages.js';
import { createLogsRouter } from './routes/logs.js';
import { createEvalRouter } from './routes/eval.js';
import { createConfigRouter } from './routes/config.js';
import { setupWebSocket } from './ws/handler.js';

export function createServer(config: TmsConfig) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const broadcast = setupWebSocket(wss);

  app.use('/api/message', createMessageRouter(config, broadcast));
  app.use('/api/logs', createLogsRouter(broadcast));
  app.use('/api/eval', createEvalRouter(config, broadcast));
  app.use('/api/config', createConfigRouter(config));

  return { app, server, wss };
}
