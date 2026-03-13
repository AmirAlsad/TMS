import { Router } from 'express';
import type { Message, TmsConfig, QuotedReply } from '@tms/shared';
import { DEFAULT_MESSAGE_PACING_MS } from '@tms/shared';
import type { BroadcastFn } from '../ws/handler.js';
import { sendToBot, getCallbackBaseUrl } from '../services/bot-client.js';
import type { ReadReceiptService } from '../services/read-receipt.js';
import { createMessageBuffer } from '../services/message-buffer.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMessageRouter(
  config: TmsConfig,
  broadcast: BroadcastFn,
  readReceiptService: ReadReceiptService,
) {
  const router = Router();
  const callbackUrl = `${getCallbackBaseUrl(config)}/api/whatsapp`;

  // Message buffering (Tier 7.1) — aggregates rapid messages before sending to bot.
  // In playground mode the buffer flushes asynchronously; the individual POST gets
  // a 202 Accepted while the aggregated message is sent to the bot on flush.
  // Track the channel from the most recent buffered message so flush uses the right channel.
  let lastBufferedChannel: Message['channel'] = 'sms';
  const buffer = createMessageBuffer(config.messageBuffering, (aggregatedMessage) => {
    const channel = lastBufferedChannel;
    const aggregated: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: aggregatedMessage,
      channel,
      timestamp: new Date().toISOString(),
    };

    sendToBot(config, aggregated)
      .then((botResult) => {
        if (botResult.silence) {
          const silenceMessage: Message = {
            id: crypto.randomUUID(),
            role: 'bot',
            content: '',
            channel,
            timestamp: new Date().toISOString(),
            silence: true,
          };
          broadcast({ type: 'bot:message', payload: silenceMessage });
          return;
        }

        const botMessage: Message = {
          id: crypto.randomUUID(),
          role: 'bot',
          content: botResult.text,
          channel,
          timestamp: new Date().toISOString(),
        };
        broadcast({ type: 'bot:message', payload: botMessage });
      })
      .catch((err) => {
        console.warn('[tms] Buffered message send failed:', (err as Error).message);
      });
  });

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

    // If message buffering is enabled, add to buffer and respond immediately (Tier 7.1).
    // The buffer will aggregate and flush after the timeout fires.
    if (buffer && !mediaUrl) {
      lastBufferedChannel = channel ?? lastBufferedChannel;
      buffer.add(content);
      res.status(202).json({ buffered: true, bufferSize: buffer.size });
      return;
    }

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

      const pacingMs = DEFAULT_MESSAGE_PACING_MS;

      // --- Silence handling ---
      if (botResult.silence) {
        const silenceMessage: Message = {
          id: crypto.randomUUID(),
          role: 'bot' as const,
          content: '',
          channel,
          timestamp: new Date().toISOString(),
          silence: true,
        };
        broadcast({ type: 'bot:message', payload: silenceMessage });
        res.json(silenceMessage);
        return;
      }

      // --- Multi-message handling ---
      if (botResult.messages && botResult.messages.length > 0) {
        const botMessages: Message[] = [];

        for (let i = 0; i < botResult.messages.length; i++) {
          const msgText = botResult.messages[i]!;
          const botMessage: Message = {
            id: crypto.randomUUID(),
            role: 'bot' as const,
            content: msgText,
            channel,
            timestamp: new Date().toISOString(),
          };
          botMessages.push(botMessage);
          broadcast({ type: 'bot:message', payload: botMessage });

          if (isWhatsApp) {
            readReceiptService.trackMessage(botMessage);
          }

          // Add pacing delay between messages (not after the last one)
          if (i < botResult.messages.length - 1 && pacingMs > 0) {
            await sleep(pacingMs);
          }
        }

        // Return the array of messages so the client knows all were sent
        res.json({ messages: botMessages });
        return;
      }

      // --- Generic mode: single message ---
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
