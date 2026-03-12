# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start server (port 4000) + client (port 5173) in parallel
pnpm build            # Build all packages (shared first, then rest in parallel)
pnpm lint             # ESLint across all packages
pnpm format           # Prettier across all packages
pnpm test             # Vitest
pnpm typecheck        # tsc --noEmit in each package

# Per-package
pnpm --filter @tms/server dev     # Server only (tsup watch + restart)
pnpm --filter @tms/client dev     # Client only (Vite dev server)
pnpm --filter @tms/shared build   # Must build shared before other packages can import it
```

## Architecture

TMS is a pnpm monorepo with four packages that communicate via a shared type system:

```
Browser (React)  <──WebSocket──>  TMS Server  ──HTTP POST──>  Bot Endpoint
                                      │
                                      └──receives──>  Logs from user's backend
```

**`packages/shared`** (`@tms/shared`) — The type contract. All types (`Message`, `LogEntry`, `EvalSpec`, `TmsConfig`, `WsMessage`), Zod validation schemas, and constants live here. Both server and client import from this package. It must be built before other packages can use it. Built with tsup, exports ESM only.

**`packages/server`** (`@tms/server`) — Express + `ws` WebSocket server. `createServer()` in `server.ts` assembles the app: attaches routes and creates a `broadcast` function from `ws/handler.ts`. Routes use factory functions that receive config and broadcast as dependencies. The config loader (`services/config.ts`) reads `tms.config.yaml` or `tms.config.json` from cwd with `${ENV_VAR}` interpolation. Includes the full eval system (conversation loop, user bot, LLM judge, batch runs, cost tracking, history/regression detection), WhatsApp simulation, and media handling. Built with tsup.

**`packages/client`** (`@tms/client`) — React 19 + Vite + Tailwind. Single Zustand store in `stores/store.ts` holds all state (messages, logs, channel, config, eval results, WhatsApp state). The `useWebSocket` hook connects to the server and dispatches incoming `WsMessage` payloads to the store. Messages are sent via REST (`POST /api/message`), not WebSocket — the server broadcasts the response back over WebSocket to all clients. Vite proxies `/api` and `/ws` to the server in dev mode.

**`packages/cli`** (`@tms/cli`) — Commander.js CLI with `tms start` and `tms run <specs...>`. The `run` command supports `--parallel`, `--suite <name>`, `--runs <n>`, `--check-regression`, `--verbose`, `--json`, and `--output <path>` flags. Exit codes: 0 (passed), 1 (failed), 2 (needs_review), 3 (regression detected).

### Data flow for a message

1. Client POSTs `{ content, channel }` to `/api/message`
2. Server creates a `Message`, broadcasts `user:message` via WebSocket
3. Server calls the configured bot endpoint via `services/bot-client.ts`
4. Server broadcasts `bot:message` via WebSocket
5. Client's `useWebSocket` hook receives both and adds them to the Zustand store

### Data flow for logs

1. External backend POSTs a log entry to `/api/logs` (validated with Zod `logEntrySchema`)
2. Server broadcasts `log:entry` via WebSocket
3. Client displays it in the LogPanel

### Data flow for evals

1. Client or CLI triggers `POST /api/eval/run` (or `/batch`, `/suite/:name`, `/comparative`)
2. Server loads the eval spec, creates an eval ID, broadcasts `eval:started`
3. Conversation loop runs: user bot generates actions → messages sent to bot endpoint → responses collected
4. Judge LLM evaluates the transcript against requirements
5. Result saved to `eval-results/`, broadcast as `eval:result`

### Data flow for WhatsApp events

- Reactions: `POST /api/whatsapp/reaction` → broadcast via WebSocket → callback to bot endpoint
- Read receipts: managed by `ReadReceiptService` (3 modes) → broadcast + status callback
- Typing indicators: `POST /api/whatsapp/typing` → broadcast via WebSocket

## Conventions

- All packages use ESM (`"type": "module"`) — use `.js` extensions in TypeScript imports
- Strict TypeScript (`tsconfig.base.json`), prefix unused args with `_`
- Prettier: single quotes, trailing commas, 100 char width, semicolons
- Server and CLI build with tsup; client builds with Vite
- Types and schemas go in `@tms/shared`, not duplicated across packages

## Current state

Phases 1–3 are fully implemented and the CLI (Phase 4) is functional. Key services in `packages/server/src/services/`:

- `conversation.ts` — conversation loop engine (turn-based user bot ↔ bot endpoint)
- `user-bot.ts` — LLM-powered user simulator with tool calling
- `evaluator.ts` — LLM-as-judge for requirement classification
- `hooks.ts` — lifecycle hook execution (before/after shell commands)
- `bot-client.ts` — HTTP client for bot endpoint communication
- `config.ts` — config file loading with `${ENV_VAR}` interpolation
- `eval-results.ts` — eval result persistence to `eval-results/`
- `eval-spec-loader.ts` — YAML eval spec loading from `evals/`
- `eval-history.ts` — per-spec pass rate tracking, regression detection, baselines
- `batch-runs.ts` — batch run persistence in `eval-results/batches/`
- `suite-loader.ts` — eval suite loading from `evals/suites/`
- `eval-logger.ts` — scoped eval logging with level filtering
- `ai-registry.ts` — Vercel AI SDK provider registry (Anthropic, OpenAI)
- `read-receipt.ts` — WhatsApp read receipt service (3 modes)
- `project-root.ts` — workspace root detection

Eval specs are YAML files in `evals/`. Eval suites are YAML files in `evals/suites/`.

## Example Bot Endpoint

The `example-bot-endpoint/` directory contains BookBot, a reference scheduling bot that demonstrates tool calling, media handling, audio transcription, and WhatsApp features. See [docs/example-bot-endpoint.md](docs/example-bot-endpoint.md) for details.
