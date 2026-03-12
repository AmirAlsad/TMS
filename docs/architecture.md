# Architecture

This document describes the internal architecture of TMS for contributors who need to understand, navigate, and modify the codebase.

## Overview

TMS is a pnpm monorepo with four packages that communicate through a shared type system. The high-level topology:

```
Browser (React + Zustand)
    |
    |--- REST POST /api/message ---> TMS Server (Express)
    |<-- WebSocket (ws) -----------> TMS Server
                                        |
                                        |--- HTTP POST ---> Bot Endpoint
                                        |<-- JSON response -|
                                        |
                                        |<-- POST /api/logs --- External Backend
```

Messages flow from the browser to the server via REST. The server forwards them to the configured bot endpoint, then broadcasts both the user message and bot response to all connected clients via WebSocket. The client never sends messages over WebSocket -- it only receives them.

## Package Structure

```
packages/
  shared/    @tms/shared   — Types, Zod schemas, constants
  server/    @tms/server   — Express + ws server, services layer
  client/    @tms/client   — React 19 + Vite + Tailwind frontend
  cli/       @tms/cli      — Commander.js CLI runner
```

### packages/shared (@tms/shared)

The type contract for the entire system. All TypeScript interfaces, Zod validation schemas, and constants live here. Both server and client import from this package.

**Key files:**

- `src/types.ts` -- All TypeScript interfaces (`Message`, `EvalSpec`, `EvalResult`, `TmsConfig`, `WsMessage`, `UserBotAction`, `WhatsAppEvent`, etc.)
- `src/schemas.ts` -- Zod schemas that mirror the type definitions, used for runtime validation at API boundaries
- `src/constants.ts` -- Shared constants (`DEFAULT_PORT`, `CHANNELS`, `DEFAULT_TURN_LIMIT`), media type map (`MEDIA_TYPE_MAP`), and media helper utilities
- `src/index.ts` -- Re-exports everything from the above files

Built with tsup, exports ESM only. **Must be built before other packages can import it** (`pnpm --filter @tms/shared build`).

### packages/server (@tms/server)

Express HTTP server with a `ws` WebSocket server. The entry point is `createServer()` in `src/server.ts`, which:

1. Creates an Express app with CORS and JSON middleware
2. Creates an HTTP server and attaches a `WebSocketServer`
3. Calls `setupWebSocket()` to get a `broadcast` function
4. Initializes a `ReadReceiptService` for WhatsApp read tracking
5. Mounts route factories, passing `config`, `broadcast`, and services as dependencies

```typescript
// server.ts -- the assembly point
export function createServer(config: TmsConfig) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const broadcast = setupWebSocket(wss);

  app.use('/api/message', createMessageRouter(config, broadcast, readReceiptService));
  app.use('/api/logs', createLogsRouter(broadcast));
  app.use('/api/eval', createEvalRouter(config, broadcast));
  app.use('/api/config', createConfigRouter(config));
  app.use('/api/media', createMediaRouter());
  app.use('/api/whatsapp', createWhatsAppRouter(config, broadcast, readReceiptService));

  // Clean up uploaded media files on shutdown
  cleanupMediaDir();

  return { app, server, wss };
}
```

The server uses a **factory pattern** for routes: each route file exports a `create*Router()` function that receives its dependencies and returns an Express `Router`. This avoids global state and makes the dependency graph explicit.

### packages/client (@tms/client)

React 19 single-page app built with Vite and styled with Tailwind CSS.

**State management:** A single Zustand store (`src/stores/store.ts`) holds all application state -- messages, logs, channel selection, eval results, WhatsApp state (reactions, read receipts, typing indicators), and UI preferences (theme, config panel visibility).

**WebSocket hook:** The `useWebSocket` hook (`src/hooks/useWebSocket.ts`) connects to the server and dispatches incoming `WsMessage` payloads to the Zustand store based on message type. This is the only place WebSocket messages are consumed.

**Message sending:** Messages are sent via REST (`POST /api/message`), not WebSocket. The server broadcasts the response back over WebSocket to all connected clients. This design means multiple browser tabs see the same conversation in real time.

In dev mode, Vite proxies `/api` and `/ws` to the server (port 4000).

### packages/cli (@tms/cli)

Commander.js CLI with two commands:

- **`tms start`** -- Starts the TMS server. Accepts `--port` and `--config` options. Loads config, creates the server, and listens.
- **`tms run <specs...>`** -- Runs eval specs headlessly without the UI. Accepts `--output` (JSON report file), `--json` (stdout), `--verbose` (detailed transcripts), `--parallel` (concurrent execution). Exits with code 0 (passed), 1 (failed), or 2 (needs_review).

## Data Flows

### Message Flow (Playground Mode)

The core interaction loop when a user types a message in the browser:

```
1. Client POSTs { content, channel, quotedReply?, mediaType?, mediaUrl? } to /api/message
2. Server creates a Message object with crypto.randomUUID() id
3. Server broadcasts { type: 'user:message', payload: message } via WebSocket
4. Server calls sendToBot() -- HTTP POST to the configured bot endpoint
5. Server parses the bot response (supports .message, .response, .content, .text shapes)
6. Server broadcasts { type: 'bot:message', payload: botMessage } via WebSocket
7. Client's useWebSocket hook receives both messages and adds them to the Zustand store
```

For WhatsApp channels, additional steps occur: read receipts are marked on user response, typing indicators are emitted, and a `callbackUrl` is passed to the bot endpoint so it can send status callbacks back.

### Eval Flow

When an eval is triggered via `POST /api/eval/run`:

```
1. Parse or load the EvalSpec (inline YAML, spec object, or name from evals/ directory)
2. Generate an eval ID, save initial result, broadcast eval:started
3. Run before hook if configured (shell command via services/hooks.ts)
4. Run the conversation loop (services/conversation.ts):
   a. UserBot generates actions via LLM (services/user-bot.ts)
   b. Actions are dispatched (send message, react, reply, wait, etc.)
   c. Messages are sent to the bot endpoint and responses collected
   d. Loop continues until goalComplete, turnLimit, or error
5. Run after hook if configured
6. Run the judge (services/evaluator.ts):
   a. Build prompt with interleaved transcript + events
   b. LLM classifies each requirement as passed/needs_review/failed
   c. Overall classification = worst individual classification
7. Save result to eval-results/ directory, broadcast eval:result
```

### Log Flow

External backends send structured logs to TMS for display alongside the conversation:

```
1. External backend POSTs a log entry to /api/logs
2. Server validates with Zod logEntrySchema
3. Server broadcasts { type: 'log:entry', payload: logEntry } via WebSocket
4. Client displays the log in the LogPanel
```

### WhatsApp Event Flow

WhatsApp-specific events flow through dedicated endpoints and WebSocket message types:

- **Reactions:** `POST /api/whatsapp/reaction` -- validated, broadcast via WebSocket, and forwarded to the bot endpoint as an immediate callback (matching Twilio webhook timing)
- **Read receipts:** Managed by `ReadReceiptService` with three modes (see Key Services below). Receipts are broadcast as `whatsapp:read_receipt` events and fire status callbacks to the bot endpoint.
- **Typing indicators:** `POST /api/whatsapp/typing` -- broadcast as `whatsapp:typing_start` or `whatsapp:typing_stop`
- **Status callbacks:** The server sends `type: 'status_callback'` POSTs to the bot endpoint when messages are read, mimicking Twilio's StatusCallback webhook.

## Key Services

All services live in `packages/server/src/services/`.

### config.ts -- Configuration Loading

Loads `tms.config.yaml` or `tms.config.json` from the project root. Supports `${ENV_VAR}` interpolation via recursive string replacement. Falls back to a default config if no file is found. See [Configuration](./configuration.md) for the full config reference.

### project-root.ts -- Project Root Detection

Walks up from `process.cwd()` looking for `pnpm-workspace.yaml` to find the monorepo root. Result is cached after the first call.

### ai-registry.ts -- Model Provider Registry

Creates a Vercel AI SDK provider registry with Anthropic and OpenAI providers:

```typescript
export const registry = createProviderRegistry({ anthropic, openai });

export function resolveModel(modelString: string): LanguageModel {
  return registry.languageModel(modelString);
}
```

Model strings use the format `provider:model-name` (e.g., `anthropic:claude-sonnet-4-20250514`, `openai:gpt-4o`).

### bot-client.ts -- Bot Endpoint Communication

Handles all HTTP communication with the configured bot endpoint:

- **`sendToBot()`** -- Sends a user message to the bot endpoint. Supports multiple response shapes (`data.message`, `data.response`, `data.content`, `data.text`, or plain string). Extracts optional `usage` (token counts) and `metrics` (cost, latency, cached tokens) from the response. Passes a `callbackUrl` for WhatsApp channels so the bot can send status/typing callbacks.
- **`sendStatusCallback()`** -- Fire-and-forget POST to notify the bot that a message was delivered or read. Mimics Twilio's StatusCallback webhook.
- **`sendReactionCallback()`** -- Fire-and-forget POST to notify the bot of a reaction event. Mimics Twilio's inbound webhook for WhatsApp reactions.

### conversation.ts -- Conversation Loop Engine

Orchestrates the automated conversation between the user bot and the target bot:

- Creates per-conversation `ReadReceiptService` and `UserBot` instances
- Runs a turn-based loop up to `evalSpec.turnLimit`
- Each turn: generates user bot actions, dispatches them (via `dispatchAction()`), sends the last message to the bot endpoint
- Handles `wait` actions with a retry mechanism (up to `MAX_CONSECUTIVE_WAITS = 3`, with `WAIT_DELAY_MS = 5000` between waits)
- Tracks token usage per turn for both user bot and bot endpoint
- Emits WhatsApp typing indicators and manages read receipts during the conversation
- Returns a `ConversationResult` with the transcript, turn count, usage data, and any WhatsApp events

The `dispatchAction()` function handles each `UserBotAction` type: creating messages, broadcasting them, firing reaction callbacks, and tracking state.

### user-bot.ts -- LLM User Simulator

Uses the Vercel AI SDK `generateText()` with tool calling to simulate a real user:

- **System prompt building:** Constructs a prompt from the eval spec's goal, persona, and channel. For WhatsApp, includes available tools (reactions, quoted replies, voice notes) based on the spec's `whatsapp.userBot` config.
- **Transcript role flipping:** The user bot's own messages become `assistant` role, and the target bot's messages become `user` role. WhatsApp events (reactions, read receipts) are interleaved chronologically.
- **Tool-based actions:** Defines tools (`send_message`, `react_to_message`, `reply_to_message`, `send_voice_note`, `wait`, `remove_reaction`) and maps LLM tool calls to `UserBotAction` objects. The tool set is filtered based on the eval spec's WhatsApp config.
- **Fallback:** If the LLM produces text without tool calls, it is treated as a `send_message` action.

### evaluator.ts -- LLM-as-Judge

Evaluates a completed conversation transcript against the eval spec's requirements:

- **Prompt building:** Creates a system prompt instructing the judge to classify each requirement. The user prompt includes the full transcript with tool calls/results and WhatsApp events interleaved chronologically.
- **Response parsing:** Extracts JSON from the LLM response, validates classifications, and determines the overall classification as the worst individual result (`passed` < `needs_review` < `failed`).

### hooks.ts -- Lifecycle Hook Execution

Runs shell commands for `before` and `after` hooks defined in eval specs:

```typescript
export function runHook(command: string, timeoutMs = 30_000): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => { ... });
  });
}
```

### read-receipt.ts -- Read Receipt Service

Manages WhatsApp read receipt state with three modes:

- **`on_response`** -- Marks all unread bot messages as read when the user sends a reply (default)
- **`auto_delay`** -- Automatically marks messages as read after a configurable delay (`autoDelayMs`, default 2000ms)
- **`manual`** -- Only marks messages as read when explicitly requested via `POST /api/whatsapp/read`

Each read receipt is broadcast via WebSocket and triggers a status callback to the bot endpoint.

### eval-spec-loader.ts -- Eval Spec Loading

Loads YAML eval spec files from the `evals/` directory (relative to project root). Supports both spec names (resolved to `evals/<name>.yaml`) and full file paths. Validates specs against the `evalSpecSchema`.

### eval-results.ts -- Eval Result Persistence

Saves eval results as JSON files in an `eval-results/` directory. Generates timestamp-based IDs (`YYYY-MM-DD_HH-MM-SS`). Provides `save`, `get`, and `list` operations.

### eval-history.ts -- Eval History & Regression Detection

Tracks per-spec pass rates over time, computes trends (`improving`/`stable`/`declining`), detects regressions, and manages baselines. Baselines are stored in `eval-results/baselines.json`.

### batch-runs.ts -- Batch Run Persistence

Persists batch run metadata (label, status, spec IDs, parallel flag) to `eval-results/batches/`. Tracks comparative runs and suite executions.

### suite-loader.ts -- Eval Suite Loading

Loads eval suites from YAML files in `evals/suites/`. Each suite defines a list of spec names to run together.

### eval-logger.ts -- Eval Logging

Creates scoped logger functions that broadcast `log:entry` WebSocket messages with level filtering based on config.

## Route Structure

All routes use the factory pattern -- each file exports a `create*Router(config, broadcast, ...)` function.

| Route | Method | Handler | Purpose |
|---|---|---|---|
| `/api/message` | POST | `createMessageRouter` | Send a user message, get bot response |
| `/api/logs` | POST | `createLogsRouter` | Ingest a log entry from external backend |
| `/api/eval/specs` | GET | `createEvalRouter` | List available eval spec names |
| `/api/eval/run` | POST | `createEvalRouter` | Start an eval run (async) |
| `/api/eval/batch` | POST | `createEvalRouter` | Start multiple eval runs sequentially |
| `/api/eval/:id` | GET | `createEvalRouter` | Get a specific eval result |
| `/api/eval` | GET | `createEvalRouter` | List all eval results |
| `/api/config` | GET | `createConfigRouter` | Get current config |
| `/api/config` | PUT | `createConfigRouter` | Update config at runtime |
| `/api/eval/suites` | GET | `createEvalRouter` | List available eval suites |
| `/api/eval/suites/:name` | GET | `createEvalRouter` | Get a specific suite definition |
| `/api/eval/suite/:name` | POST | `createEvalRouter` | Run all specs in a suite |
| `/api/eval/comparative` | POST | `createEvalRouter` | Run multiple instances of one spec |
| `/api/eval/batches` | GET | `createEvalRouter` | List all batch runs |
| `/api/eval/batches/:id` | GET | `createEvalRouter` | Get a specific batch run |
| `/api/eval/history` | GET | `createEvalRouter` | Get pass rate trends for all specs |
| `/api/eval/history/:specName` | GET | `createEvalRouter` | Get history for a specific spec |
| `/api/eval/baselines` | GET | `createEvalRouter` | List all baseline results |
| `/api/eval/:id/baseline` | POST | `createEvalRouter` | Set an eval result as baseline |
| `/api/eval/costs` | GET | `createEvalCostsRouter` | Aggregated cost analytics |
| `/api/eval-assets/*` | GET | static | Serve eval spec assets (images, docs, contacts) |
| `/api/media` | POST | `createMediaRouter` | Upload a media file (WhatsApp) |
| `/api/media/:filename` | GET | `createMediaRouter` | Serve an uploaded media file |
| `/api/whatsapp/reaction` | POST | `createWhatsAppRouter` | Add a reaction |
| `/api/whatsapp/reaction/remove` | POST | `createWhatsAppRouter` | Remove a reaction |
| `/api/whatsapp/read` | POST | `createWhatsAppRouter` | Manually mark messages as read |
| `/api/whatsapp/typing` | POST | `createWhatsAppRouter` | Emit typing indicator |

## WebSocket Protocol

The WebSocket endpoint is at `/ws`. The server sends JSON-encoded `WsMessage` objects. Clients receive only; they do not send messages over WebSocket.

```typescript
interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
}
```

| Type | Payload | Direction | Description |
|---|---|---|---|
| `user:message` | `Message` | Server -> Client | A user message was sent |
| `bot:message` | `Message` | Server -> Client | The bot responded |
| `log:entry` | `LogEntry` | Server -> Client | A log entry was ingested |
| `eval:started` | `EvalResult` | Server -> Client | An eval run has started |
| `eval:status` | `EvalStatusPayload` | Server -> Client | Eval progress update (current turn) |
| `eval:result` | `EvalResult` | Server -> Client | An eval run completed or failed |
| `whatsapp:reaction` | `WhatsAppReaction` | Server -> Client | A reaction was added |
| `whatsapp:reaction_removed` | `WhatsAppReaction` | Server -> Client | A reaction was removed |
| `whatsapp:read_receipt` | `WhatsAppReadReceipt` | Server -> Client | A message was read |
| `whatsapp:typing_start` | `WhatsAppTypingEvent` | Server -> Client | Someone started typing |
| `whatsapp:typing_stop` | `WhatsAppTypingEvent` | Server -> Client | Someone stopped typing |
| `batch:started` | `BatchRun` | Server -> Client | A batch run has started |
| `batch:completed` | `BatchRun` | Server -> Client | A batch run has finished |

The `broadcast` function (`ws/handler.ts`) iterates over all connected WebSocket clients and sends the message to each one with `readyState === OPEN`.

## Type System

All types live in `@tms/shared`. Zod schemas in `schemas.ts` mirror the TypeScript interfaces in `types.ts` and are used for runtime validation at API boundaries (incoming requests to routes).

### Core Types

- **`Message`** -- A conversation message with `id`, `role` (user/bot), `content`, `channel`, `timestamp`. Optional fields for WhatsApp: `quotedReply`, `mediaType`, `mediaUrl`, `transcription`, `readStatus`. Optional fields for tool visibility: `toolCalls`, `toolResults`.
- **`Channel`** -- `'sms' | 'whatsapp'`
- **`LogEntry`** -- A structured log with `timestamp`, `level`, `source`, `message`, and optional `data` record.
- **`TmsConfig`** -- Top-level configuration: `bot` (endpoint, method, headers, timeoutMs, retries), optional `userBot` (model, systemPrompt), optional `judge` (model), optional `logs` (enabled, level), optional `server` (port, maxConcurrency, maxConcurrentEvals), optional `whatsapp`, optional `pricing` (per-model input/output costs).

### Eval Types

- **`EvalSpec`** -- Defines an eval: `name`, `description`, `channel`, `userBot` (goal, persona), `requirements` (string[]), `turnLimit`, optional `hooks` (before/after shell commands), optional `whatsapp` config.
- **`EvalResult`** -- The outcome of an eval run: `id`, `specName`, `status` (running/completed/failed), `classification` (passed/needs_review/failed), `requirements` (with per-requirement classification and reasoning), `transcript`, timestamps, optional `tokenUsage` summary.
- **`Classification`** -- `'passed' | 'needs_review' | 'failed'`

### WhatsApp Types

- **`UserBotAction`** -- Discriminated union of actions the user bot can take: `send_message`, `react_to_message`, `remove_reaction`, `reply_to_message`, `send_voice_note`, `wait`.
- **`WhatsAppEvent`** -- Union of `WhatsAppReaction`, `WhatsAppReadReceipt`, `WhatsAppTypingEvent`.
- **`ReadReceiptMode`** -- `'auto_delay' | 'manual' | 'on_response'`

### Eval Orchestration Types

- **`EvalSuite`** -- A named collection of spec names to run together, loaded from `evals/suites/`.
- **`BatchRun`** -- Container for parallel/sequential spec executions with label, status, parallel flag, and optionally `comparativeSpec` and `runCount`.
- **`SpecHistory`** -- Pass rate tracking per spec: results, passRate, recentPassRate, trend, regression flag.
- **`Trend`** -- `'improving' | 'stable' | 'declining'`
- **`ComparativeAggregate`** -- Summary of multiple runs of the same spec with pass/fail/needsReview counts and per-requirement pass rates.

### Usage Tracking Types

- **`TokenUsage`** -- `promptTokens`, `completionTokens`, `totalTokens`
- **`TokenUsageSummary`** -- Aggregated usage across `userBot`, `judge`, `botEndpoint`, and `total`, with optional `botMetrics`.
- **`BotEndpointMetrics`** -- Per-turn metrics from the bot: `cost`, `cachedTokens`, `uncachedTokens`, `latencyMs`.

## Build System

| Package | Tool | Output |
|---|---|---|
| `@tms/shared` | tsup | ESM (`dist/`) |
| `@tms/server` | tsup | ESM (`dist/`) |
| `@tms/cli` | tsup | ESM (`dist/`) |
| `@tms/client` | Vite | Static assets (`dist/`) |

**Build order:** `@tms/shared` must be built first because all other packages import from it. The `pnpm build` script handles this automatically (shared first, then the rest in parallel).

All packages use `"type": "module"` for ESM. TypeScript imports use `.js` extensions (e.g., `import { loadConfig } from './config.js'`).

## Conventions

- **ESM everywhere** -- All packages use `"type": "module"` and `.js` extensions in imports
- **Strict TypeScript** -- `tsconfig.base.json` with strict mode, prefix unused args with `_`
- **Prettier** -- Single quotes, trailing commas, 100-character line width, semicolons
- **Types in shared** -- All types and schemas go in `@tms/shared`, never duplicated across packages
- **Factory pattern for routes** -- Each route file exports a function that receives dependencies and returns a Router
- **Zod at boundaries** -- Runtime validation with Zod schemas happens at API entry points (routes), not internally
- **Fire-and-forget callbacks** -- Status and reaction callbacks to the bot endpoint use `.catch(() => {})` and never block the main flow
