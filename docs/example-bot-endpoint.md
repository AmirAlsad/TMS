# Example Bot Endpoint — BookBot

BookBot is the reference bot endpoint included with TMS. It is a scheduling bot built with the Vercel AI SDK that demonstrates tool calling, multi-step execution, prompt caching, media handling, audio transcription, and WhatsApp features. Use it to learn how TMS communicates with bot endpoints, or as a starting point for building your own.

## Overview

BookBot manages appointments for a fictional business through an in-memory store. It offers four services (Haircut, Consultation, Dental Cleaning, Massage) with Mon–Sat business hours. The bot uses 9 scheduling tools plus 2 WhatsApp tools, handles media attachments (images, PDFs, vCards, audio), and supports Groq Whisper for audio transcription.

## Setup

```bash
cd example-bot-endpoint
npm install
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
# Optionally add GROQ_API_KEY for audio transcription
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | API key for Anthropic models |
| `GROQ_API_KEY` | No | API key for Groq Whisper audio transcription |

### Running

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

The bot listens on port 3000 by default. Point TMS at it with:

```yaml
# tms.config.yaml
bot:
  endpoint: http://localhost:3000/chat
```

## Configuration

All configuration lives in `config.yaml`:

| Field | Default | Description |
|-------|---------|-------------|
| `port` | `3000` | Port the bot server listens on |
| `model` | `anthropic:claude-sonnet-4-6` | Model to use (Vercel AI SDK `provider:model` format) |
| `maxTokens` | `1024` | Max tokens per response |
| `maxSteps` | `5` | Max tool-call steps per request |
| `tms.url` | `http://localhost:4000` | URL of the TMS server (used for callback registration) |
| `systemPrompt` | *(see config.yaml)* | System prompt for the bot |

## Integration Contract

BookBot implements the TMS bot endpoint contract. This section documents the full request/response format — use it as a reference when building your own bot.

### Request Format (TMS → Bot)

TMS sends a JSON POST to `/chat`:

| Field | Type | Present | Description |
|-------|------|---------|-------------|
| `message` | `string` | Always (unless media-only) | The user's message text |
| `messageId` | `string` | Always | Unique message identifier |
| `channel` | `string` | Always | `"sms"` or `"whatsapp"` |
| `quotedReply` | `object` | WhatsApp only | `{ targetMessageId, quotedBody }` if the user quoted a message |
| `mediaType` | `string` | Optional | MIME type of attached media |
| `mediaUrl` | `string` | Optional | URL of attached media file |
| `callbackUrl` | `string` | WhatsApp only | URL for typing, reaction, and status callbacks |

TMS also sends callback POSTs to `/chat`:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"status_callback"` | Message was delivered or read |
| `type` | `"reaction_callback"` | User reacted to a bot message |

### Response Format (Bot → TMS)

TMS accepts the response text in any of these fields: `response`, `message`, `content`, or `text`.

Optional metadata fields:

| Field | Type | Description |
|-------|------|-------------|
| `usage` | `object` | `{ promptTokens, completionTokens, totalTokens }` |
| `metrics` | `object` | `{ cost, cachedTokens, uncachedTokens, latencyMs }` |
| `toolCalls` | `array` | `[{ toolName, input }]` — tools the bot invoked |
| `toolResults` | `array` | `[{ toolName, result }]` — results from tool invocations |
| `structuredData` | `object` | Machine-readable appointment data (optional) |
| `mediaType` | `string` | MIME type if bot sends media back |
| `mediaUrl` | `string` | URL of media the bot sends back |
| `transcription` | `string` | Audio transcription if input was audio |
| `silent` | `boolean` | `true` when bot suppresses response (reaction acknowledgment) |

### Callback Types

When `callbackUrl` is provided, the bot can POST to:

- **`${callbackUrl}/typing`** — Typing indicator: `{ active: true, fromUser: false }`
- **`${callbackUrl}/reaction`** — Reaction: `{ targetMessageId, emoji }`

## Tools

BookBot exposes 11 tools:

### Scheduling Tools

| Tool | Description |
|------|-------------|
| `get_services` | List all available services with pricing and duration |
| `get_business_hours` | Get business hours for all days or a specific day |
| `get_appointment_details` | Look up an appointment by ID |
| `find_next_available` | Find the next available slots for a service starting from a date |
| `check_availability` | List open time slots for a given date |
| `book_appointment` | Book an appointment (customer name, service, date, time) |
| `cancel_appointment` | Cancel an appointment by ID |
| `list_appointments` | List a customer's upcoming appointments |
| `reschedule_appointment` | Move an appointment to a new date/time |

### WhatsApp Tools

These tools are only available when the bot receives a `callbackUrl` (WhatsApp channel):

| Tool | Description |
|------|-------------|
| `react_to_message` | React to a user message with an emoji |
| `send_media` | Send an image or document to the user with an optional caption |

### Services & Hours

**Services:** Haircut (30 min, $35), Consultation (60 min, $75), Dental Cleaning (45 min, $120), Massage (60 min, $90)

**Hours:** Mon–Fri 9am–5pm, Sat 10am–2pm, Sun closed

## Media Handling

BookBot processes incoming media attachments based on their MIME type:

| Media Type | Processing |
|------------|------------|
| **Images** (`image/*`) | Fetched as bytes and passed to the LLM as multimodal image input |
| **PDFs** (`application/pdf`) | Text extracted via `pdf-parse` and passed as text |
| **vCards** (`text/vcard`) | Parsed into structured contact info (name, phone, email, org) |
| **Audio** (`audio/*`) | Transcribed via STT provider (see below), transcription passed as text |
| **Documents** (`.doc`, `.docx`, etc.) | Acknowledged; text extraction not supported |
| **Video** (`video/*`) | Acknowledged; video processing not supported |

The bot can also send media back using the `send_media` tool with a publicly accessible URL.

## Audio Transcription

BookBot supports speech-to-text transcription for voice notes and audio messages using a pluggable provider system.

### Groq Whisper Provider

The default (and currently only) STT provider uses Groq's Whisper API:

- **Primary model:** `whisper-large-v3-turbo`
- **Fallback model:** `whisper-large-v3` (used on model-specific errors)
- **Supported formats:** OGG, AAC, MPEG, MP4, M4A, WAV, WebM, FLAC

### Setup

Set the `GROQ_API_KEY` environment variable in your `.env` file. If the key is not set, audio messages fall back to a placeholder asking the user to send text instead.

### Graceful Degradation

- No `GROQ_API_KEY` → placeholder response ("I can't process audio, please send text")
- Transcription fails → error placeholder with failure notice
- Empty transcription → treated as failure

### Adding Providers

The STT system uses a provider interface (`SttProvider`) with `name` and `transcribe(audio, mimeType)` methods. To add a new provider, implement the interface and register it in `stt/index.ts`.

## WhatsApp Features

### Reactions

The bot can react to user messages using the `react_to_message` tool. The system prompt instructs the bot to respond with `[SILENT]` for simple acknowledgment reactions (thumbs up, heart, OK hand) rather than generating a conversational reply.

### Quoted Replies

When the user quotes a message, the bot receives `quotedReply` context with the original message text. Each user message includes a `[msg:<id>]` prefix so the bot can reference specific messages.

### Typing Indicators

BookBot sends a fire-and-forget typing indicator to `${callbackUrl}/typing` before processing each message, providing visual feedback while the LLM generates a response.

### Silent Mode

When the bot's response text is exactly `[SILENT]`, the server sets `silent: true` in the response. TMS uses this to suppress displaying a bot message — useful for reactions that don't warrant a text reply.

## Building Your Own Bot

To create a TMS-compatible bot endpoint, your server needs to:

1. **Accept POST requests** with a JSON body containing at minimum `message` and `channel` fields
2. **Return JSON** with the reply text in a `response`, `message`, `content`, or `text` field
3. Optionally return `usage`, `metrics`, `toolCalls`, and `toolResults` for the TMS eval system to track

That's it for a minimal implementation. For WhatsApp support, also handle:

- `callbackUrl` for typing indicators and reaction callbacks
- `quotedReply` for quote context
- `mediaType`/`mediaUrl` for media attachments
- Callback POSTs with `type: "status_callback"` and `type: "reaction_callback"`

See the [Bot Endpoint Contract](api-reference.md#bot-endpoint-contract) in the API reference for the full specification.

## Key Source Files

| File | Purpose |
|------|---------|
| `src/server.ts` | Express server with `/chat` endpoint |
| `src/llm.ts` | LLM processing with tool calling, history, and multimodal support |
| `src/tools.ts` | 9 scheduling tool definitions |
| `src/media-tools.ts` | `send_media` WhatsApp tool |
| `src/media-processor.ts` | Media type detection and processing pipeline |
| `src/stt/groq.ts` | Groq Whisper STT provider |
| `src/stt/index.ts` | STT provider factory |
| `src/store.ts` | In-memory appointment store |
| `config.yaml` | Bot configuration |
