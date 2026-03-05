import { Router } from 'express';
import type { TmsConfig } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { sendToBot } from '../services/bot-client.js';

export function createMessageRouter(config: TmsConfig, broadcast: BroadcastFn) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { content, channel } = req.body;

    if (!content || !channel) {
      res.status(400).json({ error: 'content and channel are required' });
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content,
      channel,
      timestamp: new Date().toISOString(),
    };

    broadcast({ type: 'user:message', payload: userMessage });

    try {
      const botResponse = await sendToBot(config, userMessage);
      const botMessage = {
        id: crypto.randomUUID(),
        role: 'bot' as const,
        content: botResponse,
        channel,
        timestamp: new Date().toISOString(),
      };
      broadcast({ type: 'bot:message', payload: botMessage });
      res.json(botMessage);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `Bot request failed: ${errorMessage}` });
    }
  });

  return router;
}
