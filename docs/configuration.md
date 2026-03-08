# Configuration Reference

TMS is configured via a `tms.config.yaml` (preferred) or `tms.config.json` file in the project root.

## Config File Location

TMS walks up from the current working directory looking for `pnpm-workspace.yaml` to find the project root. It then looks for `tms.config.yaml` or `tms.config.json` in that directory.

If no config file is found, TMS uses these defaults:

```yaml
bot:
  endpoint: http://localhost:3000/chat
  method: POST
server:
  port: 4000
```

## Environment Variable Interpolation

Use `${VAR_NAME}` syntax anywhere in the config file. Variables are resolved at load time from `process.env`. Unset variables resolve to an empty string.

```yaml
bot:
  endpoint: ${BOT_ENDPOINT}
  headers:
    Authorization: Bearer ${BOT_API_KEY}
```

## Config Fields

### `bot` (required)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bot.endpoint` | `string` | `http://localhost:3000/chat` | URL of your bot's chat endpoint. |
| `bot.method` | `string` | `"POST"` | HTTP method used to call the bot endpoint. |
| `bot.headers` | `Record<string, string>` | `{}` | Custom headers sent with every bot request. |

### `userBot` (optional)

Configuration for the AI-powered user simulator used during evals.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `userBot.model` | `string` | -- | AI model identifier. Format: `"provider:model"`, e.g. `"anthropic:claude-haiku-4-5-20251001"`. |
| `userBot.systemPrompt` | `string` | -- | Custom base system prompt for the user bot. |

### `judge` (optional)

Configuration for the LLM judge that evaluates transcripts.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `judge.model` | `string` | -- | AI model identifier for the judge. Same format as `userBot.model`. |

### `logs` (optional)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `logs.enabled` | `boolean` | `true` | Enable or disable the log ingestion endpoint. |

### `server` (optional)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `server.port` | `number` | `4000` | Port for the TMS server. |

### `whatsapp` (optional)

WhatsApp-specific simulation settings. These apply to both interactive playground sessions and automated evals on the `whatsapp` channel.

#### `whatsapp.readReceipts`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `whatsapp.readReceipts.mode` | `"auto_delay"` \| `"manual"` \| `"on_response"` | `"on_response"` | How read receipts are sent. `auto_delay` marks messages as read after a timer. `manual` requires explicit API calls or clicking the "Read" button in the UI. `on_response` marks all unread messages as read when the user sends a reply. Can be changed at runtime via the settings panel or `PUT /api/whatsapp/read-receipt-mode`. |
| `whatsapp.readReceipts.autoDelayMs` | `number` | `2000` | Delay in milliseconds before auto-marking as read. Only used when mode is `auto_delay`. |

#### `whatsapp.userBot`

Controls what actions the AI user bot is allowed to take during WhatsApp evals.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `whatsapp.userBot.allowReactions` | `boolean` | `true` | Allow the user bot to send emoji reactions. Set to `false` to disable. |
| `whatsapp.userBot.allowQuotedReplies` | `boolean` | `true` | Allow the user bot to quote-reply to specific messages. Set to `false` to disable. |
| `whatsapp.userBot.allowVoiceNotes` | `boolean` | `false` | Allow the user bot to send voice notes. Must be explicitly set to `true`. |
| `whatsapp.userBot.voiceNoteAssets` | `string[]` | -- | List of audio file paths the user bot can reference when sending voice notes. |

## Full Annotated Example

```yaml
# tms.config.yaml

bot:
  endpoint: ${BOT_ENDPOINT}       # Required. Your bot's chat URL.
  method: POST                     # HTTP method (default: POST)
  headers:
    Authorization: Bearer ${BOT_API_KEY}
    X-Custom-Header: my-value

userBot:
  model: anthropic:claude-haiku-4-5-20251001   # provider:model format
  systemPrompt: >
    You are a realistic customer testing a business chatbot.
    Be conversational and occasionally make typos.

judge:
  model: anthropic:claude-sonnet-4-5-20250514

logs:
  enabled: true

server:
  port: 4000

whatsapp:
  readReceipts:
    mode: auto_delay
    autoDelayMs: 3000
  userBot:
    allowReactions: true
    allowQuotedReplies: true
    allowVoiceNotes: false
    voiceNoteAssets:
      - ./assets/voice-greeting.ogg
      - ./assets/voice-question.ogg
```
