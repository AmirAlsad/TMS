# Eval System

TMS evaluates conversational AI through automated multi-turn conversations. An LLM-powered "user bot" simulates a real person pursuing a specific goal, chatting with your bot endpoint just like a human would. After the conversation completes, an LLM "judge" reviews the full transcript and classifies each requirement as **passed**, **needs_review**, or **failed**.

This lets you test your bot's behavior end-to-end without manual interaction -- define a scenario, run it, and get structured results.

## Eval Spec Format

Eval specs are YAML files that live in the `evals/` directory. Each spec defines a single test scenario.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique identifier for the eval |
| `description` | string | yes | What this eval tests |
| `channel` | `"sms"` or `"whatsapp"` | yes | Channel to simulate |
| `userBot.goal` | string | yes | What the simulated user is trying to accomplish |
| `userBot.persona` | string | yes | How the simulated user should behave |
| `requirements` | string[] | yes | Criteria the judge evaluates after the conversation |
| `turnLimit` | number | yes | Maximum conversation turns before stopping |
| `hooks.before` | string | no | Shell command to run before the conversation starts |
| `hooks.after` | string | no | Shell command to run after the conversation ends |
| `whatsapp` | object | no | WhatsApp-specific configuration (see [WhatsApp Features](whatsapp.md)) |

## Annotated Examples

### SMS Eval: `example.yaml`

A straightforward SMS booking flow:

```yaml
name: book-appointment-happy-path
description: Test that BookBot can walk a cooperative user through checking availability and booking an appointment
channel: sms

userBot:
  goal: >
    You want to book a haircut appointment for next Tuesday.
    You're flexible on time but prefer the morning.
    Your name is Sarah Chen.
  persona: >
    You're polite and cooperative. You answer questions directly
    and confirm details when asked.

requirements:
  - The bot should check availability before booking
  - The bot should confirm the appointment details (service, date, time) with the user before finalizing
  - The bot should provide a confirmation with an appointment ID after booking
  - The conversation should feel natural, not like a form fill

turnLimit: 12
```

- **channel: sms** -- The user bot only has `send_message` and `wait` actions available. No reactions or quoted replies.
- **userBot.goal** -- Gives the user bot a concrete objective with specific details (service type, preferred day, name). The user bot will pursue this goal across multiple turns.
- **userBot.persona** -- Shapes the user bot's communication style. A cooperative persona makes for a happy-path test.
- **requirements** -- Each string becomes a separate evaluation criterion for the judge. The judge classifies each independently.
- **turnLimit: 12** -- The conversation stops after 12 turns even if the goal is not complete.

### WhatsApp Eval: `whatsapp-appointment-booking.yaml`

The same basic scenario but on WhatsApp with richer interaction features:

```yaml
name: whatsapp-appointment-booking
description: >
  Test booking flow on WhatsApp with reactions and quoted replies enabled.
  The user bot may react to confirmations and use quoted replies naturally.
channel: whatsapp

userBot:
  goal: >
    You want to book a haircut appointment for next Wednesday afternoon.
    Your name is Maria Garcia. When the bot confirms the booking,
    react with a thumbs up before thanking them.
  persona: >
    You're friendly and expressive. You use emoji reactions naturally
    to acknowledge messages. You're decisive and know what you want.

requirements:
  - The bot should greet the user and ask what service they need
  - The bot should check availability before booking
  - The bot should confirm the appointment details with the user before finalizing
  - The bot should provide a confirmation with an appointment ID after booking
  - The conversation should feel natural for a WhatsApp interaction

turnLimit: 12

whatsapp:
  readReceipts:
    mode: on_response
  userBot:
    allowReactions: true
    allowQuotedReplies: true
    allowVoiceNotes: false
```

- **channel: whatsapp** -- Enables WhatsApp-specific actions and behaviors: reactions, quoted replies, typing indicators, read receipts.
- **whatsapp.readReceipts.mode** -- Controls when bot messages are marked as read by the simulated user. `on_response` means all unread bot messages are marked read when the user sends a reply.
- **whatsapp.userBot** -- Controls which WhatsApp actions the user bot can perform. Reactions and quoted replies are enabled by default on WhatsApp -- set `allowReactions: false` or `allowQuotedReplies: false` to disable them. Voice notes must be explicitly enabled with `allowVoiceNotes: true`.
- The **goal** explicitly instructs the user bot to react with a thumbs up -- you can direct WhatsApp-specific behavior through the goal text.

For full WhatsApp configuration details, see [WhatsApp Features](whatsapp.md).

## The User Bot

The user bot is an LLM that plays the role of a human user in the conversation.

### How It Works

The user bot uses the Vercel AI SDK's `generateText` function with tool calling. On each turn, it receives the conversation history and decides what actions to take.

**Model configuration:** The model is specified as a `"provider:model-name"` string (e.g., `"anthropic:claude-haiku-4-5-20251001"`, `"openai:gpt-4o"`). Set it in your config file under `userBot.model`. See [Configuration](configuration.md) for details.

**Available tools vary by channel:**

| Tool | SMS | WhatsApp | Description |
|------|-----|----------|-------------|
| `send_message` | yes | yes | Send a text message (primary action) |
| `wait` | yes | yes | Pause and wait for the bot to finish processing |
| `react_to_message` | no | configurable | React to a message with an emoji |
| `remove_reaction` | no | configurable | Remove a previously sent reaction |
| `reply_to_message` | no | configurable | Send a quoted reply to a specific message |
| `send_voice_note` | no | configurable | Send a voice note |

WhatsApp tools are controlled by the `whatsapp.userBot` section of the eval spec (e.g., `allowReactions`, `allowQuotedReplies`, `allowVoiceNotes`).

### System Prompt Construction

The user bot's system prompt is assembled from:

1. **Base prompt** -- Default text about simulating a real user in text messages (or a custom base via `userBot.systemPrompt` in config)
2. **Goal** -- From `userBot.goal` in the eval spec
3. **Persona** -- From `userBot.persona` in the eval spec
4. **Available actions** -- Dynamically generated based on channel and eval spec settings

### Transcript Context (Role Flipping)

When sending conversation history to the user bot's LLM, roles are flipped:

- User bot messages become `"assistant"` (since from the LLM's perspective, it wrote them)
- Bot endpoint messages become `"user"` (since from the LLM's perspective, it received them)

WhatsApp events (reactions, read receipts) are interleaved chronologically as text annotations in the transcript.

### Fallback for Non-Tool-Calling Models

If the LLM produces raw text instead of tool calls, TMS parses it for markers:

- `[GOAL_COMPLETE]` in the text sets the goal as complete
- `[WAIT]` as the entire text is treated as a wait action
- Any other text is sent as a regular message

## The Conversation Loop

The `runConversation` function orchestrates the automated conversation:

1. **For each turn** (up to `turnLimit`):
   - Generate user bot actions via the LLM
   - If the user bot says "wait", delay 5 seconds and retry (up to 3 consecutive waits)
   - Dispatch all actions: send messages, fire reactions, emit typing indicators
   - If the user bot sets `goalComplete: true`, stop the conversation
   - Send the last user message to the bot endpoint and get the response
   - Broadcast all messages and events via WebSocket (visible in the UI if running)

2. **Wait handling:** If the user bot returns a `wait` action, TMS delays 5 seconds then re-generates. After 3 consecutive waits, it skips the turn. This handles cases where the bot says "let me check" and needs processing time.

3. **Goal completion:** The user bot signals it is done by setting `goalComplete: true` on its final `send_message` or `reply_to_message` action. The conversation stops immediately.

4. **WhatsApp specifics during conversation:**
   - Typing indicators (`typing_start`/`typing_stop`) are emitted before and after user messages
   - Read receipts are tracked per the eval spec's `readReceipts.mode` setting
   - Reactions fire immediate callbacks to the bot endpoint (matching Twilio's webhook behavior)

## The Judge

After the conversation completes, the `evaluateTranscript` function sends the full transcript to a judge LLM for evaluation.

### What the Judge Receives

- The complete conversation transcript with messages from both sides
- WhatsApp events (reactions, read receipts) interleaved chronologically
- Tool call details (`[TOOL CALLS]` and `[TOOL RESULTS]` sections) showing what the bot actually did
- The list of requirements to evaluate

### What the Judge Evaluates

The judge considers:

- Whether the bot used appropriate tools rather than fabricating data
- Whether tool inputs were correct and reasonable for the user's request
- Whether tool results were accurately communicated to the user
- Overall conversational quality: tone, helpfulness, logical flow
- WhatsApp-specific behavior (reactions, quoted replies, read receipts) when applicable

### Classification

Each requirement gets one of three classifications:

| Classification | Meaning |
|---------------|---------|
| **passed** | Requirement fully met |
| **needs_review** | Ambiguous -- may need human review |
| **failed** | Requirement not met |

The judge returns JSON with per-requirement classification and reasoning. The **overall result** is the worst individual classification -- if any requirement fails, the entire eval fails.

## Lifecycle Hooks

Hooks are shell commands that run before or after the conversation:

```yaml
hooks:
  before: "node scripts/seed-test-data.js"
  after: "node scripts/cleanup.js"
```

Common uses:

- **before**: Reset database state, seed test data, start mock services
- **after**: Clean up test data, stop mock services, collect logs

Hooks run with a 30-second timeout. TMS treats them as opaque -- it runs the command and moves on. If a hook fails (non-zero exit), the eval fails with an error.

## Token Usage Tracking

TMS tracks token usage across all LLM calls in an eval:

- **User bot**: prompt and completion tokens for each turn
- **Judge**: prompt and completion tokens for the evaluation
- **Bot endpoint**: token usage if the endpoint reports it in its response

The bot endpoint can also report additional metrics: `cost`, `cachedTokens`, `uncachedTokens`, and `latencyMs`. These are aggregated into the final eval result as `botMetrics` (total cost, total cached/uncached tokens, average latency).

All usage data appears in the eval result under `tokenUsage`.

## Running Evals

### CLI

The primary way to run evals:

```bash
# Run a single eval by name (looks in evals/ directory)
tms run example

# Run multiple evals
tms run cancel-appointment reschedule-appointment

# Run with verbose output (shows full transcript)
tms run example --verbose

# Output results as JSON to stdout
tms run example --json

# Write JSON report to file
tms run example --output results.json

# Run specs concurrently
tms run cancel-appointment reschedule-appointment --parallel

# Use a specific config file
tms run example -c path/to/tms.config.yaml
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | All evals passed |
| 1 | At least one eval failed |
| 2 | At least one eval needs review (none failed) |

### REST API

You can also trigger evals via HTTP:

- **`POST /api/eval/run`** -- Run a single eval spec
- **`POST /api/eval/batch`** -- Run multiple eval specs sequentially

See [API Reference](api-reference.md) for request/response details.

## AI Model Configuration

TMS uses the [Vercel AI SDK](https://sdk.vercel.ai/) provider registry to support multiple LLM providers. Models are specified as `"provider:model-name"` strings.

### Built-in Providers

The following providers are registered out of the box in `packages/server/src/services/ai-registry.ts`:

| Provider | Package | Example Models |
|----------|---------|---------------|
| `anthropic` | `@ai-sdk/anthropic` | `anthropic:claude-haiku-4-5-20251001`, `anthropic:claude-sonnet-4-20250514` |
| `openai` | `@ai-sdk/openai` | `openai:gpt-4o`, `openai:gpt-4o-mini` |

Each provider requires its own API key set as an environment variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).

### Adding Providers

To add a new provider (e.g., Google, Mistral), install its Vercel AI SDK package and register it in `ai-registry.ts`:

```ts
import { google } from '@ai-sdk/google';

export const registry = createProviderRegistry({ anthropic, openai, google });
```

After registering, you can use it anywhere a model string is accepted (e.g., `"google:gemini-2.0-flash"`).

### Configuration

Set models in your `tms.config.yaml`:

```yaml
userBot:
  model: "anthropic:claude-haiku-4-5-20251001"   # cheaper model for user simulation

judge:
  model: "anthropic:claude-sonnet-4-20250514"     # more capable model for evaluation
```

The user bot and judge can use different providers. A smaller, cheaper model works well for user simulation, while a more capable model improves judge accuracy.

See [Configuration](configuration.md) for all config options.
