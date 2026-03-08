# API Reference

Base URL: `http://localhost:4000` (configurable via `server.port`).

## REST Endpoints

### POST /api/message

Send a message and receive the bot's response.

**Request body:**

```json
{
  "content": "Hello, I need help booking an appointment",
  "channel": "sms",
  "quotedReply": {
    "targetMessageId": "msg-uuid",
    "quotedBody": "Original message text"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes | Message text. |
| `channel` | `"sms"` \| `"whatsapp"` | Yes | Channel to simulate. |
| `quotedReply` | `object` | No | Quote-reply to a previous message (WhatsApp). |

**Response:** `200` with the bot's `Message` object.

```bash
curl -X POST http://localhost:4000/api/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Hi there", "channel": "sms"}'
```

**Errors:** `400` if `content` or `channel` is missing. `502` if the bot endpoint fails.

---

### POST /api/logs

Push a log entry from your backend. Validated against the `logEntrySchema`.

**Request body:**

```json
{
  "timestamp": "2026-03-07T12:00:00.000Z",
  "level": "info",
  "source": "my-backend",
  "message": "User authenticated",
  "data": { "userId": "abc123" }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | `string` | Yes | ISO 8601 timestamp. |
| `level` | `"debug"` \| `"info"` \| `"warn"` \| `"error"` | Yes | Log level. |
| `source` | `string` | Yes | Name of the system producing the log. |
| `message` | `string` | Yes | Log message. |
| `data` | `Record<string, unknown>` | No | Arbitrary structured data. |

**Response:** `204` No Content on success.

```bash
curl -X POST http://localhost:4000/api/logs \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-03-07T12:00:00Z","level":"info","source":"backend","message":"OK"}'
```

**Errors:** `400` with Zod validation details if the body is invalid.

---

### GET /api/eval/specs

List available eval spec files from the `evals/` directory.

**Response:** `200`

```json
{ "specs": ["whatsapp-appointment-booking", "whatsapp-multi-option"] }
```

```bash
curl http://localhost:4000/api/eval/specs
```

---

### POST /api/eval/run

Start an eval run. Accepts three input formats:

**By spec name** (loads from `evals/` directory):

```bash
curl -X POST http://localhost:4000/api/eval/run \
  -H "Content-Type: application/json" \
  -d '{"spec": "whatsapp-appointment-booking"}'
```

**By inline YAML:**

```bash
curl -X POST http://localhost:4000/api/eval/run \
  -H "Content-Type: application/json" \
  -d '{"yaml": "name: test\ndescription: ...\nchannel: sms\nuserBot:\n  goal: Book appointment\n  persona: Friendly customer\nrequirements:\n  - Bot greets user\nturnLimit: 10"}'
```

**By inline spec object:**

```bash
curl -X POST http://localhost:4000/api/eval/run \
  -H "Content-Type: application/json" \
  -d '{"spec": {"name":"test","description":"...","channel":"sms","userBot":{"goal":"Book","persona":"Customer"},"requirements":["Greets user"],"turnLimit":10}}'
```

**Response:** `200`

```json
{ "id": "eval-abc123", "status": "running" }
```

The eval runs asynchronously. Poll `GET /api/eval/:id` or listen on WebSocket for `eval:result`.

---

### POST /api/eval/batch

Run multiple evals sequentially by spec name.

**Request body:**

```json
{ "specs": ["whatsapp-appointment-booking", "whatsapp-multi-option"] }
```

**Response:** `200`

```json
{ "ids": ["eval-abc123", "eval-abc123_1"] }
```

```bash
curl -X POST http://localhost:4000/api/eval/batch \
  -H "Content-Type: application/json" \
  -d '{"specs": ["whatsapp-appointment-booking", "whatsapp-multi-option"]}'
```

**Errors:** `400` if `specs` is not a non-empty array of strings.

---

### GET /api/eval/:id

Get a single eval result by ID.

**Response:** `200` with an `EvalResult` object.

```json
{
  "id": "eval-abc123",
  "specName": "whatsapp-appointment-booking",
  "status": "completed",
  "classification": "passed",
  "requirements": [
    { "description": "Bot greets user", "classification": "passed", "reasoning": "..." }
  ],
  "transcript": [],
  "startedAt": "2026-03-07T12:00:00Z",
  "completedAt": "2026-03-07T12:01:00Z",
  "tokenUsage": { ... }
}
```

```bash
curl http://localhost:4000/api/eval/eval-abc123
```

**Errors:** `404` if the eval ID is not found.

---

### GET /api/eval

List all eval results.

**Response:** `200`

```json
{ "results": [ { "id": "eval-abc123", "specName": "...", "status": "completed", ... } ] }
```

```bash
curl http://localhost:4000/api/eval
```

---

### GET /api/config

Get the current TMS configuration.

**Response:** `200` with the active `TmsConfig` object.

```bash
curl http://localhost:4000/api/config
```

---

### PUT /api/config

Update the running TMS configuration (shallow merge).

**Request body:** Partial `TmsConfig` fields to merge.

```bash
curl -X PUT http://localhost:4000/api/config \
  -H "Content-Type: application/json" \
  -d '{"server": {"port": 5000}}'
```

**Response:** `200` with the updated `TmsConfig`.

---

### POST /api/whatsapp/reaction

Send a reaction event. Broadcasts to connected clients via WebSocket and fires a callback to the bot endpoint.

**Request body:**

```json
{
  "targetMessageId": "msg-uuid",
  "emoji": "👍",
  "fromUser": true,
  "timestamp": "2026-03-07T12:00:00Z"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `targetMessageId` | `string` | Yes | -- | ID of the message to react to. |
| `emoji` | `string` | Yes | -- | Emoji character. |
| `fromUser` | `boolean` | No | `true` | Whether the reaction is from the user (vs bot). |
| `timestamp` | `string` | No | Now | ISO 8601 timestamp. |

**Response:** `200`

```json
{ "ok": true, "reaction": { ... } }
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/reaction \
  -H "Content-Type: application/json" \
  -d '{"targetMessageId": "msg-uuid", "emoji": "👍"}'
```

---

### POST /api/whatsapp/reaction/remove

Remove a reaction from a message.

**Request body:**

```json
{
  "targetMessageId": "msg-uuid",
  "fromUser": true
}
```

**Response:** `200`

```json
{ "ok": true }
```

---

### POST /api/whatsapp/typing

Emit a typing indicator event.

**Request body:**

```json
{
  "active": true,
  "fromUser": false,
  "timestamp": "2026-03-07T12:00:00Z"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `active` | `boolean` | No | `true` | `true` for typing start, `false` for typing stop. |
| `fromUser` | `boolean` | No | `false` | Whether the typing is from the user (vs bot). |
| `timestamp` | `string` | No | Now | ISO 8601 timestamp. |

**Response:** `200`

```json
{ "ok": true }
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/typing \
  -H "Content-Type: application/json" \
  -d '{"active": true, "fromUser": false}'
```

---

### PUT /api/whatsapp/read-receipt-mode

Change the read receipt mode at runtime.

**Request body:**

```json
{
  "mode": "manual",
  "autoDelayMs": 2000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `"auto_delay"` \| `"manual"` \| `"on_response"` | Yes | Read receipt mode. |
| `autoDelayMs` | `number` | No | Delay in ms for `auto_delay` mode. Defaults to 2000. |

**Response:** `200`

```json
{ "ok": true, "mode": "manual" }
```

```bash
curl -X PUT http://localhost:4000/api/whatsapp/read-receipt-mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "auto_delay", "autoDelayMs": 3000}'
```

**Errors:** `400` if `mode` is missing or not one of the valid values.

---

### POST /api/whatsapp/read

Manually mark messages as read up to a given message ID.

**Request body:**

```json
{ "upToMessageId": "msg-uuid" }
```

**Response:** `200`

```json
{
  "ok": true,
  "receipts": [
    { "type": "read_receipt", "messageId": "msg-uuid", "readAt": "2026-03-07T12:00:00Z" }
  ]
}
```

```bash
curl -X POST http://localhost:4000/api/whatsapp/read \
  -H "Content-Type: application/json" \
  -d '{"upToMessageId": "msg-uuid"}'
```

---

## WebSocket Protocol

Connect to `ws://localhost:4000/ws`. Messages are JSON-encoded `WsMessage` objects:

```json
{ "type": "<WsMessageType>", "payload": { ... } }
```

### Message Types

| Type | Payload | Description |
|------|---------|-------------|
| `user:message` | `Message` | A user message was sent. |
| `bot:message` | `Message` | The bot responded. |
| `log:entry` | `LogEntry` | A log entry was pushed. |
| `eval:started` | `EvalResult` | An eval run started (status: `"running"`). |
| `eval:status` | `{ evalId, status, currentTurn, totalTurns }` | Eval progress update (mid-run). |
| `eval:result` | `EvalResult` | Eval completed or failed. |
| `whatsapp:reaction` | `WhatsAppReaction` | A reaction was added. |
| `whatsapp:reaction_removed` | `WhatsAppReaction` | A reaction was removed. |
| `whatsapp:read_receipt` | `WhatsAppReadReceipt` | A message was marked as read. |
| `whatsapp:typing_start` | `WhatsAppTypingEvent` | Typing indicator started. |
| `whatsapp:typing_stop` | `WhatsAppTypingEvent` | Typing indicator stopped. |

### Payload Shapes

**Message:**

```json
{
  "id": "uuid",
  "role": "user" | "bot",
  "content": "text",
  "channel": "sms" | "whatsapp",
  "timestamp": "ISO 8601",
  "quotedReply": { "targetMessageId": "uuid", "quotedBody": "text" },
  "mediaType": "audio/ogg",
  "mediaUrl": "https://...",
  "readStatus": { "status": "sent" | "delivered" | "read", "sentAt": "...", "deliveredAt": "...", "readAt": "..." }
}
```

**WhatsAppReaction:**

```json
{
  "type": "reaction" | "reaction_removed",
  "fromUser": true,
  "targetMessageId": "uuid",
  "emoji": "👍",
  "timestamp": "ISO 8601"
}
```

**WhatsAppReadReceipt:**

```json
{
  "type": "read_receipt",
  "messageId": "uuid",
  "readAt": "ISO 8601"
}
```

**WhatsAppTypingEvent:**

```json
{
  "type": "typing_start" | "typing_stop",
  "fromUser": true,
  "timestamp": "ISO 8601"
}
```

### Example: Listening with JavaScript

```js
const ws = new WebSocket('ws://localhost:4000/ws');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'bot:message':
      console.log('Bot:', msg.payload.content);
      break;
    case 'eval:result':
      console.log('Eval:', msg.payload.classification);
      break;
  }
};
```

---

## Bot Endpoint Contract

TMS calls your bot endpoint with HTTP POST (configurable). Your endpoint receives requests and returns responses in the formats below.

### Request (TMS sends to your bot)

```json
{
  "message": "User's message text",
  "channel": "sms",
  "quotedReply": { "targetMessageId": "uuid", "quotedBody": "text" },
  "mediaType": "audio/ogg",
  "mediaUrl": "https://...",
  "callbackUrl": "http://localhost:4000/api/whatsapp"
}
```

| Field | Type | Present | Description |
|-------|------|---------|-------------|
| `message` | `string` | Always | The user's message content. |
| `channel` | `string` | Always | `"sms"` or `"whatsapp"`. |
| `quotedReply` | `object` | WhatsApp only | Present if the user quoted a previous message. |
| `mediaType` | `string` | Optional | MIME type of attached media. |
| `mediaUrl` | `string` | Optional | URL of attached media. |
| `callbackUrl` | `string` | WhatsApp only | URL your bot can POST typing events and other callbacks to. |

### Response (your bot returns)

TMS accepts any of these response shapes:

```json
{ "message": "Bot's reply" }
{ "response": "Bot's reply" }
{ "content": "Bot's reply" }
{ "text": "Bot's reply" }
"Bot's reply"
```

### Optional Response Fields

Your bot can include additional metadata alongside the response text:

```json
{
  "message": "Your appointment is confirmed for Tuesday.",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 45,
    "totalTokens": 195
  },
  "metrics": {
    "cost": 0.0023,
    "cachedTokens": 100,
    "uncachedTokens": 50,
    "latencyMs": 1200
  },
  "toolCalls": [
    { "toolName": "bookAppointment", "input": { "date": "2026-03-10" } }
  ],
  "toolResults": [
    { "toolName": "bookAppointment", "result": { "confirmed": true } }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `usage.promptTokens` | `number` | Prompt tokens used by the bot's LLM. |
| `usage.completionTokens` | `number` | Completion tokens used. |
| `usage.totalTokens` | `number` | Total tokens used. |
| `metrics.cost` | `number` | Cost in dollars for this request. |
| `metrics.cachedTokens` | `number` | Number of cached tokens used. |
| `metrics.uncachedTokens` | `number` | Number of uncached tokens used. |
| `metrics.latencyMs` | `number` | End-to-end latency in milliseconds. |
| `toolCalls` | `ToolCallInfo[]` | Tools the bot invoked. |
| `toolResults` | `ToolResultInfo[]` | Results from tool invocations. |

### Callback Payloads

When `callbackUrl` is provided (WhatsApp channel), TMS sends callback POSTs to your bot endpoint:

**Status callback** (message read/delivered):

```json
{
  "type": "status_callback",
  "channel": "whatsapp",
  "messageId": "msg-uuid",
  "messageStatus": "read",
  "timestamp": "2026-03-07T12:00:00Z"
}
```

**Reaction callback** (user reacted to a bot message):

```json
{
  "type": "reaction_callback",
  "channel": "whatsapp",
  "targetMessageId": "msg-uuid",
  "emoji": "👍",
  "reactionType": "reaction",
  "fromUser": true,
  "timestamp": "2026-03-07T12:00:00Z"
}
```

Your bot can ignore these callbacks if it does not need them. They are fire-and-forget -- TMS does not check the response.
