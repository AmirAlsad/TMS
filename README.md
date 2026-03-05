# TMS: Text Messaging Simulator

An open-source tool for testing and evaluating conversational AI through a simulated text messaging interface.

TMS provides a web UI that displays conversations in a familiar chat layout alongside real-time logs, supporting both manual interaction (playground mode) and automated evaluation runs.

## Quickstart

```bash
# Install dependencies
pnpm install

# Start development servers (client + server)
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Configuration

Create a `tms.config.yaml` in your project root:

```yaml
bot:
  endpoint: "http://localhost:3000/chat"
  method: POST
  headers:
    Authorization: "Bearer ${BOT_API_KEY}"

server:
  port: 4000
```

Environment variables in `${VAR}` syntax are automatically resolved.

## Project Structure

```
packages/
  client/    React frontend (Vite + Tailwind)
  server/    Node.js backend (Express + WebSocket)
  shared/    Shared types, schemas, and constants
  cli/       CLI runner (scaffolded for Phase 4)
evals/       Example YAML evaluation specs
docs/        Documentation
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start client and server in dev mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type-check all packages |

## Sending Logs

Push logs to TMS from your backend to see them alongside conversations:

```bash
curl -X POST http://localhost:4000/api/logs \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-03-05T14:30:00.000Z","level":"info","source":"my-bot","message":"Processing message"}'
```

## License

MIT
