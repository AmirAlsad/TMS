import { Router } from 'express';
import type { TmsConfig, Message, WhatsAppReaction, WhatsAppTypingEvent } from '@tms/shared';
import { whatsAppReactionSchema, whatsAppTypingEventSchema } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import type { ReadReceiptService } from '../services/read-receipt.js';
import { sendReactionCallback } from '../services/bot-client.js';

export function createWhatsAppRouter(
  config: TmsConfig,
  broadcast: BroadcastFn,
  readReceiptService: ReadReceiptService,
) {
  const router = Router();

  // POST /api/whatsapp/reaction — add or update a reaction
  // Broadcasts via WS to the UI and fires an immediate callback to the bot endpoint.
  router.post('/reaction', (req, res) => {
    const parsed = whatsAppReactionSchema.safeParse({
      ...req.body,
      fromUser: req.body.fromUser ?? true,
      type: 'reaction',
      timestamp: req.body.timestamp ?? new Date().toISOString(),
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reaction payload', details: parsed.error.issues });
      return;
    }

    const reaction: WhatsAppReaction = parsed.data;
    broadcast({ type: 'whatsapp:reaction', payload: reaction });

    // Fire callback to bot endpoint and broadcast response if bot replies
    if (reaction.fromUser) {
      sendReactionCallback(config, reaction)
        .then((botResult) => {
          if (botResult) {
            const botMessage: Message = {
              id: crypto.randomUUID(),
              role: 'bot' as const,
              content: botResult.text,
              channel: 'whatsapp',
              timestamp: new Date().toISOString(),
            };
            broadcast({ type: 'bot:message', payload: botMessage });
            readReceiptService.trackMessage(botMessage);
          }
        })
        .catch(() => {});
    }

    res.json({ ok: true, reaction });
  });

  // POST /api/whatsapp/reaction/remove — remove a reaction
  router.post('/reaction/remove', (req, res) => {
    const parsed = whatsAppReactionSchema.safeParse({
      ...req.body,
      fromUser: req.body.fromUser ?? true,
      type: 'reaction_removed',
      emoji: req.body.emoji ?? '',
      timestamp: req.body.timestamp ?? new Date().toISOString(),
    });

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid reaction removal payload',
        details: parsed.error.issues,
      });
      return;
    }

    const reaction: WhatsAppReaction = parsed.data;
    broadcast({ type: 'whatsapp:reaction_removed', payload: reaction });

    // Fire callback to bot endpoint and broadcast response if bot replies
    if (reaction.fromUser) {
      sendReactionCallback(config, reaction)
        .then((botResult) => {
          if (botResult) {
            const botMessage: Message = {
              id: crypto.randomUUID(),
              role: 'bot' as const,
              content: botResult.text,
              channel: 'whatsapp',
              timestamp: new Date().toISOString(),
            };
            broadcast({ type: 'bot:message', payload: botMessage });
            readReceiptService.trackMessage(botMessage);
          }
        })
        .catch(() => {});
    }

    res.json({ ok: true });
  });

  // POST /api/whatsapp/read — manually mark messages as read up to a given message
  router.post('/read', (req, res) => {
    const { upToMessageId } = req.body;

    if (typeof upToMessageId !== 'string' || !upToMessageId) {
      res.status(400).json({ error: 'upToMessageId is required' });
      return;
    }

    const receipts = readReceiptService.markReadUpTo(upToMessageId);
    res.json({ ok: true, receipts });
  });

  // POST /api/whatsapp/typing — emit typing indicator events
  // Can be called by the client UI (fromUser: true) or by the bot endpoint (fromUser: false).
  // The bot endpoint receives the callback URL in the callbackUrl field of message payloads.
  router.post('/typing', (req, res) => {
    const active = req.body.active !== false;
    const eventType = active ? 'typing_start' : 'typing_stop';

    const parsed = whatsAppTypingEventSchema.safeParse({
      type: eventType,
      fromUser: req.body.fromUser ?? false,
      timestamp: req.body.timestamp ?? new Date().toISOString(),
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid typing payload', details: parsed.error.issues });
      return;
    }

    const typingEvent: WhatsAppTypingEvent = parsed.data;
    const wsType = active ? 'whatsapp:typing_start' : 'whatsapp:typing_stop';
    broadcast({ type: wsType, payload: typingEvent });
    res.json({ ok: true });
  });

  // PUT /api/whatsapp/read-receipt-mode — update read receipt mode at runtime
  router.put('/read-receipt-mode', (req, res) => {
    const { mode, autoDelayMs } = req.body;
    const validModes = ['auto_delay', 'manual', 'on_response'];
    if (!mode || !validModes.includes(mode)) {
      res.status(400).json({ error: `mode must be one of: ${validModes.join(', ')}` });
      return;
    }
    readReceiptService.updateConfig({ mode, autoDelayMs });
    res.json({ ok: true, mode, autoDelayMs });
  });

  return router;
}
