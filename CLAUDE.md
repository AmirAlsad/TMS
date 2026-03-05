# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start server (port 4000) + client (port 5173) in parallel
pnpm build            # Build all packages (shared first, then rest in parallel)
pnpm lint             # ESLint across all packages
pnpm format           # Prettier across all packages
pnpm test             # Vitest (no tests written yet)
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

**`packages/server`** (`@tms/server`) — Express + `ws` WebSocket server. `createServer()` in `server.ts` assembles the app: attaches routes and creates a `broadcast` function from `ws/handler.ts`. Routes use factory functions that receive config and broadcast as dependencies. The config loader (`services/config.ts`) reads `tms.config.yaml` or `tms.config.json` from cwd with `${ENV_VAR}` interpolation. Built with tsup.

**`packages/client`** (`@tms/client`) — React 19 + Vite + Tailwind. Single Zustand store in `stores/store.ts` holds all state (messages, logs, channel, config). The `useWebSocket` hook connects to the server and dispatches incoming `WsMessage` payloads to the store. Messages are sent via REST (`POST /api/message`), not WebSocket — the server broadcasts the response back over WebSocket to all clients. Vite proxies `/api` and `/ws` to the server in dev mode.

**`packages/cli`** (`@tms/cli`) — Scaffolded for Phase 4. Commander.js with `tms start` and `tms run <spec>` stubs.

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

## Conventions

- All packages use ESM (`"type": "module"`) — use `.js` extensions in TypeScript imports
- Strict TypeScript (`tsconfig.base.json`), prefix unused args with `_`
- Prettier: single quotes, trailing commas, 100 char width, semicolons
- Server and CLI build with tsup; client builds with Vite
- Types and schemas go in `@tms/shared`, not duplicated across packages

## Roadmap context

The codebase is scaffolded to support four phases. Phase 2+ services exist as empty placeholder files in `packages/server/src/services/`: `conversation.ts` (conversation loop), `user-bot.ts` (LLM user simulation), `evaluator.ts` (LLM judge), `hooks.ts` (lifecycle hooks). Eval specs are YAML files in `evals/`.
