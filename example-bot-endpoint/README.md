# Example Bot Endpoint — BookBot

A scheduling bot endpoint for TMS that demonstrates the Vercel AI SDK's tool calling, multi-step execution, and prompt caching. BookBot manages appointments through an in-memory store, giving TMS users a realistic example to learn from.

## Features

- **Tool calling** — 5 scheduling tools (check availability, book, cancel, list, reschedule)
- **Multi-step execution** — The model chains tool calls automatically (e.g., check availability then book)
- **Prompt caching** — System prompt is cached via Anthropic's `cacheControl` for lower latency on repeat requests
- **Structured data** — Booking responses include machine-readable appointment data alongside natural language

## Tools

| Tool | Description |
|------|-------------|
| `check_availability` | List open time slots for a date, optionally filtered by service |
| `book_appointment` | Book an appointment (customer name, service, date, time) |
| `cancel_appointment` | Cancel an appointment by ID |
| `list_appointments` | List a customer's upcoming appointments |
| `reschedule_appointment` | Move an appointment to a new date/time |

## Services & Hours

**Services:** Haircut (30 min, $35), Consultation (60 min, $75), Dental Cleaning (45 min, $120), Massage (60 min, $90)

**Hours:** Mon–Fri 9am–5pm, Sat 10am–2pm, Sun closed

## Setup

```bash
cd example-bot-endpoint
npm install
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
```

## Configuration

All configuration lives in `config.yaml`:

| Field | Default | Description |
|-------|---------|-------------|
| `port` | `3000` | Port the bot server listens on |
| `model` | `anthropic:claude-sonnet-4-6` | Model to use (supports any Vercel AI SDK provider) |
| `maxTokens` | `1024` | Max tokens per response |
| `maxSteps` | `5` | Max tool-call steps per request |
| `systemPrompt` | *(see config.yaml)* | System prompt for the bot |

## Running

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

## Example Conversation

```
User: What services do you offer?
Bot: We offer Haircut (30 min, $35), Consultation (60 min, $75),
     Dental Cleaning (45 min, $120), and Massage (60 min, $90).

User: What's available for a haircut next Tuesday?
Bot: [calls check_availability] Here are the open slots for Tuesday March 10...

User: Book me in at 11am. My name is Jane Doe.
Bot: [calls book_appointment] Your Haircut is booked for March 10 at 11:00 AM.
     Appointment ID: apt-3
```

## Response Format

```json
{
  "response": "Your Haircut is booked for Tuesday at 11:00 AM!",
  "structuredData": {
    "id": "apt-3",
    "customerName": "Jane Doe",
    "service": { "id": "haircut", "name": "Haircut", "durationMinutes": 30, "price": 35 },
    "date": "2026-03-10",
    "startTime": "11:00",
    "endTime": "11:30",
    "status": "confirmed"
  },
  "usage": { "promptTokens": 1200, "completionTokens": 85, "totalTokens": 1285 },
  "metrics": { "cachedTokens": 950, "latencyMs": 1200 }
}
```

## Running with TMS

1. Start the bot: `cd example-bot-endpoint && npm run dev`
2. Start TMS: `pnpm dev` (from project root)
3. Open `http://localhost:5173` and try booking an appointment
