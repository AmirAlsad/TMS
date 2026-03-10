import { Router } from 'express';
import type { Message, TmsConfig, QuotedReply } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { sendToBot, getCallbackBaseUrl } from '../services/bot-client.js';
import type { ReadReceiptService } from '../services/read-receipt.js';

export function createMessageRouter(
  config: TmsConfig,
  broadcast: BroadcastFn,
  readReceiptService: ReadReceiptService,
) {
  const router = Router();
  const callbackUrl = `${getCallbackBaseUrl(config)}/api/whatsapp`;

  router.post('/', async (req, res) => {
    const { content, channel, quotedReply, mediaType, mediaUrl } = req.body;

    if ((!content && !mediaUrl) || !channel) {
      res.status(400).json({ error: 'content and channel are required' });
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: content ?? '',
      channel,
      timestamp: new Date().toISOString(),
    };

    // Attach quoted reply if provided
    if (quotedReply && typeof quotedReply.targetMessageId === 'string') {
      userMessage.quotedReply = quotedReply as QuotedReply;
    }

    // Attach media fields if provided
    if (mediaType && mediaUrl) {
      userMessage.mediaType = mediaType;
      userMessage.mediaUrl = mediaUrl;
    }

    broadcast({ type: 'user:message', payload: userMessage });

    // Broadcast an updated copy of the user message with transcription attached
    const attachTranscription = (transcription: string) => {
      broadcast({ type: 'user:message', payload: { ...userMessage, transcription } });
    };

    const isWhatsApp = channel === 'whatsapp';

    // Mark all unread bot messages as read when user responds (on_response mode)
    if (isWhatsApp) {
      readReceiptService.onUserResponse();
    }

    try {
      const botResult = await sendToBot(config, userMessage, isWhatsApp ? callbackUrl : undefined);

      // Clear any lingering typing indicator after bot responds
      if (isWhatsApp) {
        broadcast({
          type: 'whatsapp:typing_stop',
          payload: { type: 'typing_stop', fromUser: false, timestamp: new Date().toISOString() },
        });
      }

      // If the bot returned a transcription of the user's audio, attach it
      if (botResult.transcription) {
        attachTranscription(botResult.transcription);
      }

      const botMessage: Message = {
        id: crypto.randomUUID(),
        role: 'bot' as const,
        content: botResult.text,
        channel,
        timestamp: new Date().toISOString(),
      };

      // Attach media fields from bot response
      if (botResult.mediaType) {
        botMessage.mediaType = botResult.mediaType;
        botMessage.mediaUrl = botResult.mediaUrl;
      }

      broadcast({ type: 'bot:message', payload: botMessage });

      // Track bot message for read receipts (WhatsApp only)
      if (isWhatsApp) {
        readReceiptService.trackMessage(botMessage);
      }

      res.json(botMessage);
    } catch (err) {
      if (isWhatsApp) {
        broadcast({
          type: 'whatsapp:typing_stop',
          payload: { type: 'typing_stop', fromUser: false, timestamp: new Date().toISOString() },
        });
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: `Bot request failed: ${errorMessage}` });
    }
  });

  return router;
}
