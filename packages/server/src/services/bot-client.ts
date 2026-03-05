import type { Message, TmsConfig } from '@tms/shared';

export async function sendToBot(config: TmsConfig, message: Message): Promise<string> {
  const { endpoint, method = 'POST', headers = {} } = config.bot;

  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      message: message.content,
      channel: message.channel,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bot returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  // Support common response shapes
  if (typeof data === 'string') return data;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.response === 'string') return data.response;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.text === 'string') return data.text;

  throw new Error('Could not extract message from bot response');
}
