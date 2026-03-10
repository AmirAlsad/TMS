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

// --- Media support ---

export type MediaCategory = 'image' | 'sticker' | 'audio' | 'video' | 'document' | 'contact';

export const SUPPORTED_MEDIA_TYPES: Record<string, MediaCategory> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'sticker',
  'audio/ogg': 'audio',
  'audio/aac': 'audio',
  'audio/mpeg': 'audio',
  'video/mp4': 'video',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/vcard': 'contact',
  'text/x-vcard': 'contact',
};

/** 16 MB — Twilio's maximum media size */
export const MAX_MEDIA_SIZE = 16 * 1024 * 1024;

/**
 * Resolve the media category for a given MIME type.
 * On SMS, stickers (image/webp) are treated as regular images.
 */
export function getMediaCategory(mimeType: string, channel: Channel): MediaCategory | null {
  const category = SUPPORTED_MEDIA_TYPES[mimeType] ?? null;
  if (category === 'sticker' && channel === 'sms') return 'image';
  return category;
}

/** Value for the `accept` attribute on file inputs */
export const ACCEPTED_FILE_TYPES = Object.keys(SUPPORTED_MEDIA_TYPES).join(',');
