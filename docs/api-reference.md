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
  },
  "mediaType": "image/jpeg",
  "mediaUrl": "http://localhost:4000/api/media/photo-abc123.jpg"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes (unless `mediaUrl` provided) | Message text. |
| `channel` | `"sms"` \| `"whatsapp"` | Yes | Channel to simulate. |
| `quotedReply` | `object` | No | Quote-reply to a previous message (WhatsApp). |
| `mediaType` | `string` | No | MIME type of attached media (WhatsApp only). |
| `mediaUrl` | `string` | No | URL of attached media file (WhatsApp only). |

**Response:** `200` with the bot's `Message` object.

```bash
curl -X POST http://localhost:4000/api/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Hi there", "channel": "sms"}'
```

**Example with media (WhatsApp):**

```bash
curl -X POST http://localhost:4000/api/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Check out this photo", "channel": "whatsapp", "mediaType": "image/jpeg", "mediaUrl": "http://localhost:4000/api/media/photo-abc123.jpg"}'
```

**Errors:** `400` if `content` or `channel` is missing (content not required when `mediaUrl` is provided). `502` if the bot endpoint fails.

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

Run multiple evals sequentially or in parallel by spec name.

**Request body:**

```json
{
  "specs": ["whatsapp-appointment-booking", "whatsapp-multi-option"],
  "parallel": true,
  "maxConcurrency": 3
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `specs` | `string[]` | Yes | -- | Spec names to run. |
| `parallel` | `boolean` | No | `false` | Run specs concurrently. |
| `maxConcurrency` | `number` | No | `5` | Max concurrent evals when `parallel` is true. |

**Response:** `200`

```json
{ "ids": ["eval-abc123", "eval-abc123_1"] }
```

```bash
curl -X POST http://localhost:4000/api/eval/batch \
  -H "Content-Type: application/json" \
  -d '{"specs": ["whatsapp-appointment-booking", "whatsapp-multi-option"], "parallel": true}'
```

**Errors:** `400` if `specs` is not a non-empty array of strings.

---

### GET /api/eval/suites

List available eval suites from the `evals/suites/` directory.

**Response:** `200`

```json
{ "suites": ["smoke-tests", "full-regression"] }
```

```bash
curl http://localhost:4000/api/eval/suites
```

---

### GET /api/eval/suites/:name

Get a specific suite definition.

**Response:** `200`

```json
{
  "name": "smoke-tests",
  "description": "Quick smoke tests for core features",
  "specs": ["example", "cancel-appointment"]
}
```

```bash
curl http://localhost:4000/api/eval/suites/smoke-tests
```

**Errors:** `404` if the suite is not found.

---

### POST /api/eval/suite/:name

Run all specs in a named suite.

**Request body (optional):**

```json
{ "parallel": true }
```

**Response:** `200`

```json
{ "batchId": "batch-abc123", "ids": ["eval-1", "eval-2"] }
```

```bash
curl -X POST http://localhost:4000/api/eval/suite/smoke-tests \
  -H "Content-Type: application/json" \
  -d '{"parallel": true}'
```

**Errors:** `404` if the suite is not found.

---

### POST /api/eval/comparative

Run multiple instances of one spec for comparison. Useful for measuring pass rate reliability.

**Request body:**

```json
{
  "spec": "whatsapp-appointment-booking",
  "runs": 5
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `spec` | `string` | Yes | -- | Spec name to run. |
| `runs` | `number` | No | `3` | Number of times to run (2–20). |

**Response:** `200`

```json
{ "batchId": "batch-abc123", "ids": ["eval-1", "eval-2", "eval-3", "eval-4", "eval-5"] }
```

```bash
curl -X POST http://localhost:4000/api/eval/comparative \
  -H "Content-Type: application/json" \
  -d '{"spec": "whatsapp-appointment-booking", "runs": 5}'
```

---

### GET /api/eval/batches

List all batch runs.

**Response:** `200`

```json
{
  "batches": [
    {
      "id": "batch-abc123",
      "label": "whatsapp-appointment-booking x5",
      "status": "completed",
      "evalIds": ["eval-1", "eval-2", "eval-3"],
      "parallel": false
    }
  ]
}
```

```bash
curl http://localhost:4000/api/eval/batches
```

---

### GET /api/eval/batches/:id

Get a specific batch run by ID.

**Response:** `200` with a `BatchRun` object.

```bash
curl http://localhost:4000/api/eval/batches/batch-abc123
```

**Errors:** `404` if the batch ID is not found.

---

### GET /api/eval/history

Get pass rate trends for all specs.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `window` | `number` | `5` | Number of recent runs to consider. |

**Response:** `200`

```json
{
  "histories": {
    "example": {
      "passRate": 0.8,
      "recentPassRate": 0.6,
      "trend": "declining",
      "regression": true,
      "results": [...]
    }
  }
}
```

```bash
curl http://localhost:4000/api/eval/history?window=10
```

---

### GET /api/eval/history/:specName

Get history for a specific spec with trend detection.

**Response:** `200` with a `SpecHistory` object including `passRate`, `recentPassRate`, `trend` (`improving`/`stable`/`declining`), and `regression` flag.

```bash
curl http://localhost:4000/api/eval/history/example
```

**Errors:** `404` if no history exists for the spec.

---

### GET /api/eval/baselines

List all baseline results by spec.

**Response:** `200`

```json
{
  "baselines": {
    "example": "eval-2026-03-10_14-30-00",
    "cancel-appointment": "eval-2026-03-09_10-00-00"
  }
}
```

```bash
curl http://localhost:4000/api/eval/baselines
```

---

### POST /api/eval/:id/baseline

Set an eval result as the baseline for its spec. Future regression detection compares against this baseline.

**Response:** `200`

```json
{ "ok": true, "specName": "example", "baselineId": "eval-abc123" }
```

```bash
curl -X POST http://localhost:4000/api/eval/eval-abc123/baseline
```

**Errors:** `404` if the eval ID is not found.

---

### GET /api/eval/costs

Get aggregated cost analytics across all eval results.

**Response:** `200`

```json
{
  "specs": {
    "example": {
      "runs": 5,
      "promptTokens": 15000,
      "completionTokens": 3000,
      "totalTokens": 18000,
      "estimatedCost": 0.45
    }
  },
  "totals": {
    "runs": 10,
    "promptTokens": 30000,
    "completionTokens": 6000,
    "totalTokens": 36000,
    "estimatedCost": 0.90
  },
  "pricingAvailable": true
}
```

Cost estimates require the `pricing` config. If not configured, token counts are still reported but `estimatedCost` is omitted.

```bash
curl http://localhost:4000/api/eval/costs
```

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

### POST /api/media

Upload a media file for attachment to a WhatsApp message. Files are stored in `.tms/media/` and served via `GET /api/media/:filename`.

**Request:** Multipart form data with a single file field.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | `File` | Yes | The media file to upload. Max 16MB. |

**Response:** `200`

```json
{
  "url": "http://localhost:4000/api/media/1709971200000-photo.jpg",
  "filename": "1709971200000-photo.jpg",
  "mediaType": "image/jpeg"
}
```

```bash
curl -X POST http://localhost:4000/api/media \
  -F "file=@photo.jpg"
```

**Errors:** `400` if no file is provided or the file exceeds 16MB.

---

### GET /api/media/:filename

Serve a previously uploaded media file.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filename` | `string` | Yes | The filename returned by `POST /api/media`. |

**Response:** `200` with the file contents and appropriate `Content-Type` header.

```bash
curl http://localhost:4000/api/media/1709971200000-photo.jpg --output photo.jpg
```

**Errors:** `404` if the file does not exist.

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
  "mediaType": "image/jpeg",
  "mediaUrl": "https://example.com/confirmation.jpg",
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
| `mediaType` | `string` | MIME type of media to send back (WhatsApp only). |
| `mediaUrl` | `string` | URL of media to send back (WhatsApp only). |
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
