# Example Bot Endpoint

A standalone bot endpoint for testing TMS. It connects to the Anthropic API (Claude) and responds to messages relayed by the TMS server.

## How it works

TMS sends a `POST /chat` request to this endpoint with the following payload:

```json
{
  "message": "Hello, how are you?",
  "channel": "sms"
}
```

The endpoint calls the Anthropic API and returns:

```json
{
  "response": "I'm doing well! How can I help you today?"
}
```

## Setup

```bash
cd example-bot-endpoint
npm install
```

Set your Anthropic API key by copying the example `.env` file:

```bash
cp .env.example .env
```

Then edit `.env` with your key:

```
ANTHROPIC_API_KEY=your-key-here
```

Alternatively, you can export it as an environment variable or edit `config.yaml` directly.

## Configuration

All configuration lives in `config.yaml`:

| Field | Default | Description |
|-------|---------|-------------|
| `port` | `3000` | Port the bot server listens on |
| `anthropic.apiKey` | `${ANTHROPIC_API_KEY}` | Anthropic API key (supports env var interpolation) |
| `anthropic.model` | `claude-sonnet-4-5-20250929` | Claude model to use |
| `anthropic.maxTokens` | `1024` | Max tokens per response |
| `systemPrompt` | *(see config.yaml)* | System prompt for the bot |

## Running

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

The bot listens on `http://localhost:3000/chat` by default, which matches the default TMS config (`tms.config.yaml`).

## Running with TMS

1. Start the example bot endpoint: `cd example-bot-endpoint && npm run dev`
2. Start TMS from the project root: `pnpm dev`
3. Open the TMS UI at `http://localhost:5173` and send a message
