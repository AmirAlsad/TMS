import type { Channel } from './types.js';

export const CHANNELS: Record<Channel, { label: string; description: string }> = {
  sms: {
    label: 'SMS',
    description: 'Standard text messaging simulation',
  },
  whatsapp: {
    label: 'WhatsApp',
    description: 'WhatsApp-style messaging simulation',
  },
};

export const DEFAULT_PORT = 4000;

export const DEFAULT_TURN_LIMIT = 20;
