import 'dotenv/config';
import express from 'express';
import { loadConfig } from './config.js';
import { initLlm, chat } from './llm.js';
import { initLogger, log } from './logger.js';

const config = loadConfig();
initLlm(config);
initLogger(config);

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const { type, channel } = req.body;
  const ch = channel ?? 'unknown';

  // --- Status callbacks (read receipts, delivery) — log and acknowledge ---
  if (type === 'status_callback') {
    const { messageId, messageStatus } = req.body;
    log('info', `Status callback: message ${messageId} is now ${messageStatus}`, {
      channel: ch,
      messageId,
      messageStatus,
    });
    res.json({ ok: true });
    return;
  }

  // --- Reaction callbacks — let LLM decide whether to respond ---
  if (type === 'reaction_callback') {
    const { emoji, targetMessageId, reactionType } = req.body;

    const contextNote =
      reactionType === 'reaction_removed'
        ? `[User removed reaction from message ${targetMessageId}]`
        : `[User reacted with ${emoji} to message ${targetMessageId}]`;

    log('info', `Reaction callback: ${contextNote}`, { channel: ch });

    try {
      const result = await chat(config, contextNote, ch);
      const isSilent = !result.text || result.text.trim() === '[SILENT]';

      if (isSilent) {
        log('info', 'Bot chose to stay silent after reaction', { channel: ch });
        res.json({ ok: true, silent: true });
      } else {
        log('info', `Bot responded to reaction on [${ch}]`, { channel: ch, response: result.text });
        res.json({
          response: result.text,
          usage: result.usage,
          metrics: result.metrics,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      log('error', `LLM error on reaction [${ch}]: ${errorMessage}`, { channel: ch, error: errorMessage });
      res.status(502).json({ error: `LLM request failed: ${errorMessage}` });
    }
    return;
  }

  // --- Regular message ---
  const { message, messageId, mediaType, mediaUrl, quotedReply, callbackUrl } = req.body;

  // Allow media-only messages (no text body) on WhatsApp
  const hasMedia = typeof mediaType === 'string' && typeof mediaUrl === 'string';
  const hasMessage = message && typeof message === 'string';

  if (!hasMessage && !hasMedia) {
    res.status(400).json({ error: 'Missing required field: message (or media attachment)' });
    return;
  }

  const effectiveMessage = hasMessage ? message : '';

  log('info', `Incoming message on [${ch}]`, {
    channel: ch,
    message: effectiveMessage,
    ...(hasMedia ? { mediaType, mediaUrl } : {}),
  });

  // Fire-and-forget typing indicator if callback URL is provided
  if (callbackUrl) {
    fetch(`${callbackUrl}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true, fromUser: false }),
    }).catch(() => {});
  }

  try {
    const result = await chat(config, effectiveMessage, ch, {
      messageId,
      quotedReply,
      callbackUrl,
      mediaType: hasMedia ? mediaType : undefined,
      mediaUrl: hasMedia ? mediaUrl : undefined,
    });
    log('info', `Bot responded on [${ch}]`, { channel: ch, response: result.text });
    res.json({
      response: result.text,
      usage: result.usage,
      metrics: result.metrics,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      ...(result.structuredData ? { structuredData: result.structuredData } : {}),
      ...(result.mediaType ? { mediaType: result.mediaType, mediaUrl: result.mediaUrl } : {}),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    log('error', `LLM error on [${ch}]: ${errorMessage}`, { channel: ch, error: errorMessage });
    res.status(502).json({ error: `LLM request failed: ${errorMessage}` });
  }
});

app.listen(config.port, () => {
  log('info', `Bot endpoint started on http://localhost:${config.port}/chat`, {
    model: config.model,
    tmsUrl: config.tms.url,
  });
});
