export type { SttProvider, SttResult } from './types.js';
import type { SttProvider } from './types.js';
import { createGroqProvider } from './groq.js';

/**
 * Create an STT provider based on available environment variables.
 *
 * Returns `null` if no provider is configured — callers should degrade
 * gracefully (e.g. acknowledge audio without transcription).
 *
 * To add a new provider:
 * 1. Create a file in this directory implementing `SttProvider`
 * 2. Add a check for its env var below
 */
export function createSttProvider(): SttProvider | null {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return createGroqProvider(groqKey);
  }

  return null;
}
