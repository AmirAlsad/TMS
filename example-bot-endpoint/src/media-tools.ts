import { tool } from 'ai';
import { z } from 'zod';

/**
 * Pending media map — stores media intents from `send_media` tool calls,
 * keyed by channel. Consumed after generateText() completes.
 */
interface PendingMedia {
  mediaType: string;
  mediaUrl: string;
  caption?: string;
}

const pendingMedia = new Map<string, PendingMedia>();

/**
 * Read and clear any pending media for a channel.
 * Called after generateText() to attach media to the response.
 */
export function consumePendingMedia(channel: string): PendingMedia | undefined {
  const media = pendingMedia.get(channel);
  if (media) {
    pendingMedia.delete(channel);
  }
  return media;
}

/**
 * Creates the send_media tool for the bot to include media in its response.
 * The tool stores the media intent in the pending map; the caller reads it
 * after generation completes (same pattern as structuredData extraction).
 */
export function createSendMediaTool(channel: string) {
  return {
    send_media: tool({
      description:
        'Send an image or document to the user via WhatsApp. Use this to share visual information like appointment confirmations, service menus, or helpful images.',
      inputSchema: z.object({
        mediaType: z
          .string()
          .describe('MIME type of the media (e.g. "image/jpeg", "application/pdf")'),
        mediaUrl: z.string().url().describe('Publicly accessible URL of the media file'),
        caption: z
          .string()
          .optional()
          .describe('Optional text caption to accompany the media'),
      }),
      execute: async ({ mediaType, mediaUrl, caption }) => {
        pendingMedia.set(channel, { mediaType, mediaUrl, caption: caption ?? undefined });
        return { success: true, mediaType, mediaUrl, caption: caption ?? null };
      },
    }),
  };
}
