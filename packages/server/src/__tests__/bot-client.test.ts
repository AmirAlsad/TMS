import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendToBot } from '../services/bot-client.js';
import type { TmsConfig, Message } from '@tms/shared';

const mockConfig: TmsConfig = {
  bot: { endpoint: 'http://localhost:3000/chat', method: 'POST', timeoutMs: 5000, retries: 0 },
};

const mockMessage: Message = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello',
  channel: 'sms',
  timestamp: new Date().toISOString(),
};

describe('sendToBot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts text from { message: string } response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'Bot reply' }),
      }),
    );

    const result = await sendToBot(mockConfig, mockMessage);
    expect(result.text).toBe('Bot reply');
  });

  it('extracts text from { response: string } format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Bot reply' }),
      }),
    );

    const result = await sendToBot(mockConfig, mockMessage);
    expect(result.text).toBe('Bot reply');
  });

  it('extracts text from { content: string } format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: 'Bot reply' }),
      }),
    );

    const result = await sendToBot(mockConfig, mockMessage);
    expect(result.text).toBe('Bot reply');
  });

  it('extracts text from { text: string } format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'Bot reply' }),
      }),
    );

    const result = await sendToBot(mockConfig, mockMessage);
    expect(result.text).toBe('Bot reply');
  });

  it('extracts usage info when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Reply',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          }),
      }),
    );

    const result = await sendToBot(mockConfig, mockMessage);
    expect(result.usage?.totalTokens).toBe(15);
  });

  it('throws on 400 without retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendToBot(mockConfig, mockMessage)).rejects.toThrow('Bot returned 400');
    expect(fetchMock).toHaveBeenCalledTimes(1); // No retries for 400
  });

  it('retries on 502 and succeeds', async () => {
    // Use vi.useFakeTimers to avoid actual delay
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad gateway'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Success' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const retryConfig: TmsConfig = {
      bot: { endpoint: 'http://localhost:3000/chat', method: 'POST', timeoutMs: 5000, retries: 1 },
    };

    const resultPromise = sendToBot(retryConfig, mockMessage);

    // Advance timer past the 1s backoff delay
    await vi.advanceTimersByTimeAsync(1500);

    const result = await resultPromise;
    expect(result.text).toBe('Success');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('throws when no text or mediaUrl in response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ someOtherField: 'value' }),
      }),
    );

    await expect(sendToBot(mockConfig, mockMessage)).rejects.toThrow(
      'Could not extract message',
    );
  });
});
