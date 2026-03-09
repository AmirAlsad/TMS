import type { TextPart, ImagePart } from 'ai';
import { log } from './logger.js';

export type MediaContent = Array<TextPart | ImagePart>;

/**
 * Parse a vCard string into a human-readable contact summary.
 */
function parseVCard(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const fields: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^([^:;]+)[;:](.+)$/);
    if (!match) continue;
    const key = match[1]!.toUpperCase();
    const value = match[2]!;

    switch (key) {
      case 'FN':
        fields.name = value;
        break;
      case 'TEL':
        fields.phone = (fields.phone ? fields.phone + ', ' : '') + value;
        break;
      case 'EMAIL':
        fields.email = (fields.email ? fields.email + ', ' : '') + value;
        break;
      case 'ORG':
        fields.organization = value;
        break;
      case 'TITLE':
        fields.title = value;
        break;
      case 'ADR': {
        // ADR fields are separated by semicolons
        const parts = value.split(';').filter(Boolean);
        if (parts.length > 0) fields.address = parts.join(', ');
        break;
      }
    }
  }

  if (Object.keys(fields).length === 0) {
    return raw;
  }

  const parts: string[] = ['Contact Card:'];
  if (fields.name) parts.push(`  Name: ${fields.name}`);
  if (fields.phone) parts.push(`  Phone: ${fields.phone}`);
  if (fields.email) parts.push(`  Email: ${fields.email}`);
  if (fields.organization) parts.push(`  Organization: ${fields.organization}`);
  if (fields.title) parts.push(`  Title: ${fields.title}`);
  if (fields.address) parts.push(`  Address: ${fields.address}`);

  return parts.join('\n');
}

/**
 * Build Vercel AI SDK content parts for a media message.
 *
 * Routes by MIME type:
 * - Images → ImagePart (SDK fetches URL at inference time for multimodal models)
 * - PDFs → fetch + extract text via pdf-parse
 * - vCards → fetch + parse into formatted text
 * - Audio → placeholder (transcription not yet implemented)
 * - Video → acknowledgment placeholder
 */
export async function buildMediaContent(
  mediaType: string,
  mediaUrl: string,
  textMessage: string,
): Promise<MediaContent> {
  const caption = textMessage?.trim();

  // --- Images (including stickers) ---
  // Fetch bytes directly because the AI SDK only accepts HTTPS URLs,
  // and local media is served over HTTP.
  if (mediaType.startsWith('image/')) {
    try {
      const response = await fetch(mediaUrl);
      const buffer = new Uint8Array(await response.arrayBuffer());
      const parts: MediaContent = [{ type: 'image', image: buffer, mediaType }];
      if (caption) {
        parts.push({ type: 'text', text: caption });
      } else {
        parts.push({ type: 'text', text: '[User sent an image]' });
      }
      return parts;
    } catch (err) {
      log('warn', `Failed to fetch image from ${mediaUrl}: ${err}`);
      return [
        {
          type: 'text',
          text: caption
            ? `${caption}\n\n[Image received but could not be loaded]`
            : '[Image received but could not be loaded]',
        },
      ];
    }
  }

  // --- PDF documents ---
  if (mediaType === 'application/pdf') {
    try {
      const response = await fetch(mediaUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const extractedText = (result as { text: string }).text.trim();

      if (extractedText) {
        const preamble = caption
          ? `${caption}\n\n[PDF Document — extracted text below]\n`
          : '[PDF Document — extracted text below]\n';
        return [{ type: 'text', text: `${preamble}${extractedText}` }];
      } else {
        return [
          {
            type: 'text',
            text: caption
              ? `${caption}\n\n[PDF received but no text could be extracted]`
              : '[PDF received but no text could be extracted]',
          },
        ];
      }
    } catch (err) {
      log('warn', `Failed to parse PDF from ${mediaUrl}: ${err}`);
      return [
        {
          type: 'text',
          text: caption
            ? `${caption}\n\n[PDF received but could not be read]`
            : '[PDF received but could not be read]',
        },
      ];
    }
  }

  // --- Other documents (DOC, DOCX, PPTX, XLSX) ---
  if (mediaType.startsWith('application/')) {
    return [
      {
        type: 'text',
        text: caption
          ? `${caption}\n\n[Document received (${mediaType}) — text extraction is not supported for this format. Acknowledge receipt.]`
          : `[Document received (${mediaType}) — text extraction is not supported for this format. Acknowledge receipt.]`,
      },
    ];
  }

  // --- vCard contacts ---
  if (mediaType === 'text/vcard' || mediaType === 'text/x-vcard') {
    try {
      const response = await fetch(mediaUrl);
      const raw = await response.text();
      const formatted = parseVCard(raw);
      return [
        {
          type: 'text',
          text: caption
            ? `${caption}\n\n${formatted}`
            : `[User shared a contact]\n${formatted}`,
        },
      ];
    } catch (err) {
      log('warn', `Failed to fetch vCard from ${mediaUrl}: ${err}`);
      return [
        {
          type: 'text',
          text: caption
            ? `${caption}\n\n[Contact card received but could not be read]`
            : '[Contact card received but could not be read]',
        },
      ];
    }
  }

  // --- Audio ---
  // FUTURE: Integrate a transcription provider here (e.g., OpenAI Whisper via @ai-sdk/openai).
  // Fetch audio bytes, call transcribeAudio(bytes), return TextPart with transcript.
  if (mediaType.startsWith('audio/')) {
    return [
      {
        type: 'text',
        text: '[Voice note received — audio transcription is not yet implemented. Acknowledge receipt and ask the user to send a text message instead.]',
      },
    ];
  }

  // --- Video ---
  if (mediaType.startsWith('video/')) {
    return [
      {
        type: 'text',
        text: '[Video received — video processing is not supported. Acknowledge receipt.]',
      },
    ];
  }

  // --- Fallback ---
  return [
    {
      type: 'text',
      text: `[Media received: ${mediaType} — unsupported format. Acknowledge receipt.]`,
    },
  ];
}
