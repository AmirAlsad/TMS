# WhatsApp Simulation

TMS can simulate WhatsApp messaging alongside its default SMS mode. When the channel is set to `whatsapp`, the simulator enables richer interaction capabilities -- reactions, quoted replies, typing indicators, read receipts, and WhatsApp-styled UI -- without routing through real messaging providers.

The `channel: "whatsapp"` parameter is forwarded to your bot endpoint on every request, so your backend can adjust its behavior based on the messaging platform.

## Features

### Reactions

Users can react to any message with an emoji. Reactions fire immediate callbacks to the bot endpoint, matching Twilio's webhook behavior where each reaction triggers its own inbound POST.

**Playground mode:** Hover over a message to reveal action buttons. Click the smiley-face button to open a picker with 6 preset emoji. Click an emoji to react; click it again on the reaction badge to remove it.

**Automated mode:** The user bot has `react_to_message` and `remove_reaction` tools. The eval spec controls whether reactions are enabled via `whatsapp.userBot.allowReactions`.

Reaction badges display beneath the message content, grouped by emoji.

### Quoted Replies

Users can reply to a specific message, threading their response with a visual quote block and forwarding the context to the bot endpoint.

**Playground mode:** Hover over a message and click the reply arrow button. A preview bar appears above the input field showing the quoted message with a green left border and a cancel button. Sending the message attaches `quotedReply` context (containing `targetMessageId` and `quotedBody`) to the POST body.

**Automated mode:** The user bot has a `reply_to_message` tool. Controlled by `whatsapp.userBot.allowQuotedReplies` in the eval spec.

Inside message bubbles, quoted replies render as a compact block showing the original sender's name and truncated text.

### Typing Indicators

Three bouncing dots appear when the other party is composing a message. Both user-side and bot-side typing indicators are supported.

**Playground mode:** Typing indicators are displayed when triggered via the `/api/whatsapp/typing` endpoint. The bot endpoint can POST to this URL (provided via `callbackUrl`) to show typing state before sending its response.

**Automated mode:** Typing indicators are emitted before and after the user bot sends messages, simulating natural composition behavior.

The typing indicator auto-scrolls the message panel and clears when a new message arrives.

### Read Receipts

Read receipts track whether the simulated user has read the bot's messages. Three modes are available, configurable per eval spec or session:

| Mode | Description | Best for |
|------|-------------|----------|
| `on_response` | Messages marked read when the user sends any reply (default) | Most natural default for automated evals |
| `auto_delay` | Messages marked read after a configurable delay (`autoDelayMs`, default 2000ms) | Simulating a passive user; fast eval runs |
| `manual` | User explicitly clicks to mark messages as read | Precise control; testing exact timing behavior |

When a read event fires, all messages up to and including the target are marked as read. This matches real WhatsApp behavior where opening a chat clears the entire unread stack.

Read receipts fire status callbacks to the bot endpoint with `messageStatus: "read"`, allowing backends to test "wait for read before responding" logic.

### Voice Notes

Audio message support for sending synthetic voice notes referenced by `audioRef` from eval spec assets. The bot endpoint receives these as media attachments with `mediaType` and `mediaUrl` fields.

**Status:** Partially implemented. The user bot tool and type definitions exist, but the full recording/playback UI is not yet built.

### UI Differences

When the channel is `whatsapp`, the UI switches to WhatsApp-styled visuals:

- Teal header bar
- Cream background (light mode) / dark charcoal background (dark mode)
- Green user bubbles (`#d9fdd3` light / `#005c4b` dark) with tail on the right
- White bot bubbles (light) / dark gray bot bubbles (`#202c33` dark) with tail on the left
- Checkmark ticks on messages (single = sent, double gray = delivered, double blue = read)
- Reaction badges beneath message content
- Quoted reply blocks inside bubbles showing sender name and truncated text
- Typing indicator with three bouncing dots

All WhatsApp-specific UI elements (hover actions, reactions, quoted replies, checkmarks, typing indicator) are scoped to WhatsApp mode and do not appear in SMS mode.

## Checkmark Behavior

Checkmarks appear on **bot messages**, not user messages. This is the inverse of real WhatsApp, where ticks appear on messages you sent. In TMS, the simulator tracks whether the simulated user has read the bot's messages, which is what matters for testing bot behavior around read receipts. User messages always display a static "delivered" checkmark.

This is an intentional design decision for the testing context, not a bug.

## Eval Spec Configuration

WhatsApp features are configured in the `whatsapp` block of a YAML eval spec. The `channel` field must be set to `whatsapp`.

```yaml
name: my-whatsapp-eval
channel: whatsapp

whatsapp:
  readReceipts:
    mode: on_response       # on_response | auto_delay | manual
    autoDelayMs: 2000       # only used when mode is auto_delay
  userBot:
    allowReactions: true     # let the user bot react to messages
    allowQuotedReplies: true # let the user bot use quoted replies
    allowVoiceNotes: false   # requires audio assets (partially implemented)
    voiceNoteAssets: []      # list of audio ref keys if allowVoiceNotes is true
```

### Field Reference

**`whatsapp.readReceipts.mode`** -- Controls when bot messages are marked as read. Defaults to `on_response` if omitted.

**`whatsapp.readReceipts.autoDelayMs`** -- Milliseconds to wait before auto-marking messages as read. Only applies when mode is `auto_delay`. Defaults to 2000.

**`whatsapp.userBot.allowReactions`** -- Controls whether the user bot LLM receives `react_to_message` and `remove_reaction` tools. Enabled by default when omitted -- set to `false` to explicitly disable reactions.

**`whatsapp.userBot.allowQuotedReplies`** -- Controls whether the user bot LLM receives the `reply_to_message` tool. Enabled by default when omitted -- set to `false` to explicitly disable quoted replies.

**`whatsapp.userBot.allowVoiceNotes`** -- When `true`, the user bot LLM receives the `send_voice_note` tool. Requires `voiceNoteAssets` to list available audio references. Disabled by default -- must be explicitly set to `true`.

**`whatsapp.userBot.voiceNoteAssets`** -- Array of string keys referencing pre-recorded audio files the user bot can send as voice notes.

## User Bot Actions

In automated mode, the user bot LLM selects from the following actions via tool calls. Available actions depend on the eval spec's `whatsapp.userBot` configuration.

| Action | Parameters | When to use |
|--------|------------|-------------|
| `send_message` | `body`, `goal_complete?` | Standard text message (always available) |
| `react_to_message` | `targetMessageId`, `emoji` | Emoji reaction for acknowledgment or feedback |
| `remove_reaction` | `targetMessageId` | Remove a previously sent reaction |
| `reply_to_message` | `targetMessageId`, `body`, `goal_complete?` | Quote-reply to a specific message for clarity |
| `send_voice_note` | `audioRef` | Send a pre-recorded voice note (partially implemented) |
| `wait` | (none) | Pause when the bot says it needs processing time |

The user bot can perform multiple actions per turn (e.g., react to a message and then send a reply). The `goal_complete` flag should be set to `true` on the final message action when the user bot's goal has been achieved.

## Bot Endpoint Callbacks

TMS notifies your bot endpoint about WhatsApp events via POST requests to the configured `bot.endpoint`. These are fire-and-forget -- if the endpoint rejects them, TMS continues without error.

### Status Callback (Read Receipts)

Sent when a bot message is marked as read by the simulated user.

```json
{
  "type": "status_callback",
  "channel": "whatsapp",
  "messageId": "<id of the bot message>",
  "messageStatus": "read",
  "timestamp": "<ISO 8601>"
}
```

### Reaction Callback

Sent immediately when the user reacts to or removes a reaction from a message.

```json
{
  "type": "reaction_callback",
  "channel": "whatsapp",
  "targetMessageId": "<id of the reacted-to message>",
  "emoji": "<emoji character>",
  "reactionType": "reaction",
  "fromUser": true,
  "timestamp": "<ISO 8601>"
}
```

For reaction removal, `reactionType` is `"reaction_removed"` and `emoji` may be an empty string.

### Message with Quoted Reply

When a user sends a message that quotes a previous message, the standard message POST body includes additional context:

```json
{
  "message": "Yeah I'll try that",
  "channel": "whatsapp",
  "quotedReply": {
    "targetMessageId": "<id of the quoted message>",
    "quotedBody": "How about starting with lunges?"
  }
}
```

For full API endpoint documentation, see [docs/api-reference.md](./api-reference.md).

## Example Eval Specs

The `evals/` directory includes three WhatsApp eval specs that demonstrate different feature configurations:

**`evals/whatsapp-appointment-booking.yaml`** -- Booking flow with reactions and quoted replies enabled. The user bot reacts with a thumbs up to confirmations. Uses `on_response` read receipts.

**`evals/whatsapp-multi-option.yaml`** -- Tests quoted reply selection when the bot presents multiple choices. The user bot uses `reply_to_message` to select a specific option. Uses `on_response` read receipts.

**`evals/whatsapp-reactions-only.yaml`** -- Tests that the user bot respects eval constraints. Reactions are enabled but quoted replies are disabled. Verifies the user bot only uses `send_message` and `react_to_message`. Uses `auto_delay` read receipts with a 1500ms delay.
