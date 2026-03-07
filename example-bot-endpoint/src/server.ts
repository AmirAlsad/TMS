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
  const { message, channel } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing required field: message' });
    return;
  }

  const ch = channel ?? 'unknown';
  log('info', `Incoming message on [${ch}]`, { channel: ch, message });

  try {
    const result = await chat(config, message, ch);
    log('info', `Bot responded on [${ch}]`, { channel: ch, response: result.text });
    res.json({
      response: result.text,
      usage: result.usage,
      metrics: result.metrics,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      ...(result.structuredData ? { structuredData: result.structuredData } : {}),
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
