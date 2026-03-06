import type { BotConfig } from './config.js';

let tmsUrl: string;

export function initLogger(config: BotConfig): void {
  tmsUrl = config.tms.url;
}

export function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source: 'example-bot',
    message,
    ...(data !== undefined && { data }),
  };

  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${level}] ${message}`);

  fetch(`${tmsUrl}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {
    // TMS may be down — silently ignore
  });
}
