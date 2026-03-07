# TMS: Text Messaging Simulator

An open-source tool for testing and evaluating conversational AI through a simulated text messaging interface. TMS supports manual playground mode for interactive testing and automated evaluations with LLM-driven user simulation and LLM-as-judge scoring.

## Quickstart

```bash
# 1. Install
pnpm install && pnpm build

# 2. Configure — create tms.config.yaml in your project root
cat > tms.config.yaml <<EOF
bot:
  endpoint: "http://localhost:3000/chat"
EOF

# 3. Run
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) to start chatting.

## Configuration

Full annotated `tms.config.yaml`:

```yaml
bot:
  endpoint: "http://localhost:3000/chat"   # Your bot's HTTP endpoint (required)
  method: POST                              # HTTP method (default: POST)
  headers:
    Authorization: "Bearer ${BOT_API_KEY}"  # ${ENV_VAR} syntax for secrets

userBot:
  model: "anthropic:claude-haiku-4-5-20251001"  # LLM for simulated user
  systemPrompt: "You are a realistic customer"  # Optional base prompt

judge:
  model: "openai:gpt-4o"                   # LLM for evaluation scoring

server:
  port: 4000                                # Server port (default: 4000)

whatsapp:
  readReceipts:
    mode: on_response                       # auto_delay | manual | on_response
    autoDelayMs: 3000                       # Delay for auto_delay mode
  userBot:
    allowReactions: true
    allowQuotedReplies: true
    allowVoiceNotes: false

logs:
  enabled: true                             # Enable log ingestion endpoint
```

Models use the Vercel AI SDK format: `provider:model-id` (e.g., `anthropic:claude-haiku-4-5-20251001`, `openai:gpt-4o`).

See [docs/configuration.md](docs/configuration.md) for details.

## Features

### Playground Mode

Chat with your bot manually through a familiar messaging UI. Messages and bot responses appear in real time alongside logs from your backend.

### Automated Evaluations

Define eval scenarios in YAML. TMS drives a conversation using an LLM-powered user bot, then an LLM judge scores each requirement with a three-tier classification: `passed`, `needs_review`, or `failed`.

### WhatsApp Simulation

Test WhatsApp-specific behaviors: reactions, quoted replies, typing indicators, and read receipts. The user bot can react to messages and use quoted replies naturally during automated evals.

### Log Ingestion

Push structured logs from your backend to see them alongside conversations:

```bash
curl -X POST http://localhost:4000/api/logs \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-03-05T14:30:00Z","level":"info","source":"my-bot","message":"Processing message"}'
```

### CLI Runner

Run evals headlessly in CI or from the terminal. See [CLI Commands](#cli-commands) below.

## CLI Commands

```bash
# Start the TMS server
tms start [-p, --port <port>] [-c, --config <path>]

# Run eval specs headlessly
tms run <specs...> [options]
```

`tms run` options:

| Flag | Description |
|---|---|
| `-o, --output <path>` | Write JSON report to file |
| `--json` | Output results as JSON to stdout |
| `--verbose` | Show detailed transcript output |
| `-c, --config <path>` | Path to config file |
| `--parallel` | Run specs concurrently |

Exit codes: `0` = passed, `1` = failed, `2` = needs_review.

## Bot Endpoint Contract

TMS sends a JSON POST to your configured endpoint:

```json
{
  "message": "I'd like to book an appointment",
  "channel": "sms",
  "quotedReply": { "targetMessageId": "...", "quotedBody": "..." },
  "callbackUrl": "http://localhost:4000/api/whatsapp"
}
```

Your endpoint must return JSON with the reply text in any of these shapes:

```json
{ "message": "Sure, what time works?" }
{ "response": "Sure, what time works?" }
{ "content": "Sure, what time works?" }
{ "text": "Sure, what time works?" }
```

Optionally include `usage`, `metrics`, `toolCalls`, and `toolResults` fields. See [docs/api-reference.md](docs/api-reference.md) for full API documentation.

## Eval Spec Format

```yaml
name: book-appointment-happy-path
description: Test that the bot can walk a user through booking
channel: sms

userBot:
  goal: >
    You want to book a haircut for next Tuesday morning.
    Your name is Sarah Chen.
  persona: >
    You're polite and cooperative. You answer questions directly.

requirements:
  - The bot should check availability before booking
  - The bot should confirm details before finalizing
  - The bot should provide a confirmation with an appointment ID

turnLimit: 12
```

WhatsApp evals can add a `whatsapp` block with `readReceipts` and `userBot` options. See [docs/evals.md](docs/evals.md) for the full spec reference.

## Project Structure

```
packages/
  shared/    Shared types, Zod schemas, constants
  server/    Express + WebSocket server
  client/    React 19 + Vite + Tailwind frontend
  cli/       CLI runner (tms start, tms run)
evals/       YAML evaluation specs
docs/        Documentation
```

## Development

Requires Node >= 20 and pnpm. ESM throughout, strict TypeScript.

| Command | Description |
|---|---|
| `pnpm dev` | Start client + server in dev mode |
| `pnpm build` | Build all packages (shared first) |
| `pnpm lint` | ESLint across all packages |
| `pnpm format` | Prettier across all packages |
| `pnpm test` | Run tests (Vitest) |
| `pnpm typecheck` | Type-check all packages |

Build `@tms/shared` first when working on individual packages:

```bash
pnpm --filter @tms/shared build
```

## Documentation

- [Architecture](docs/architecture.md) -- system design and data flow
- [Configuration](docs/configuration.md) -- config file reference
- [API Reference](docs/api-reference.md) -- REST and WebSocket APIs
- [WhatsApp Simulation](docs/whatsapp.md) -- WhatsApp-specific features
- [Evals](docs/evals.md) -- eval spec format and judge behavior
- [Testing](docs/testing.md) -- testing guide

## License

MIT
