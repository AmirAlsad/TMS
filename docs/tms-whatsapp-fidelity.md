# TMS: WhatsApp Fidelity Plan

## Overview

The Text Messaging Simulator (TMS) currently treats SMS and WhatsApp as equivalent chat interfaces. This document defines a plan to give WhatsApp a richer, more faithful simulation — not to replicate Twilio's wire format exactly, but to expose the full behavioral surface of WhatsApp so developers can observe how their backend handles the interactions that real users actually perform.

The guiding principle: **simulate behavior, not infrastructure.** We don't care about message delivery states (sent/failed) since the simulator always delivers. We do care about anything that could meaningfully change how a backend responds.

---

## Feature Scope

### 1. Read Receipts

**What it is:** In real WhatsApp, when a user opens and reads a message, a callback fires indicating that message has been read. Backends may act on this — for example, holding off on sending a follow-up until the user has read the previous message.

**Why it matters for testing:** This is a timing-sensitive behavioral hook. Without the ability to simulate it, developers can't test any "wait for read before responding" logic.

**Trigger modes — all three should be available, configurable per session or eval spec:**

| Mode | Description | Best for |
|------|-------------|----------|
| **Auto-delay** | Message marked read after a configurable delay (e.g., 2s) | Simulating a passive user; fast eval runs |
| **Manual** | Tester clicks a "Mark as Read" button in the UI | Precise control; testing exact timing behavior |
| **On-response** | Message marked read implicitly when the user bot sends any reply | Most natural default for automated eval mode |

**What the simulator fires:** A `read_receipt` event targeting a specific `messageSid`, timestamped at the moment it triggers. Multiple unread messages can accumulate before a single "read" action marks all of them read (matching real WhatsApp behavior where opening a chat marks everything as read).

---

### 2. Message Reactions

**What it is:** WhatsApp users can long-press a message and react with an emoji. In real Twilio, this arrives as a special inbound payload carrying the emoji and a reference to the message being reacted to.

**Why it matters for testing:** Reactions are implicit feedback signals. A coach sending a workout plan that gets a 🔥 reaction is meaningful data the IA might want to act on. Without simulation support, this behavior path is entirely untestable.

**UI (manual mode):**
- Long-press (or hover + click) on any message in the coach bubble to open an emoji picker
- Selected emoji appears as a reaction badge on that message
- Tester can remove or change a reaction

**User bot (automated mode):**
- The user bot LLM should be given a `react_to_message` action alongside its standard `send_message` action
- The goal-conditioned prompt should describe when reactions are appropriate (e.g., reacting to something emotionally resonant rather than informational)
- The bot should be able to pick the emoji, not just react generically

**Event payload:**
```json
{
  "type": "reaction",
  "fromUser": true,
  "targetMessageSid": "<sid of coach message>",
  "emoji": "🔥",
  "timestamp": "<iso8601>"
}
```

**Note on removal:** Users can also un-react (remove a reaction). This should be a separate event type (`reaction_removed`) since backends might track reaction state.

---

### 3. Quoted Replies

**What it is:** WhatsApp lets users tap "Reply" on a specific message, which threads their response visually and includes a reference to the original. The backend receives the quoted message's content and ID alongside the reply text.

**Why it matters for testing:** A user replying specifically to "try 3 sets of 10 squats" is semantically different from sending the same text cold. The IA needs the context thread to respond correctly. Without quoted reply support, this entire branch of user behavior is invisible.

**UI (manual mode):**
- Swipe or click "Reply" on a specific coach message
- A quoted preview bar appears above the input box (matching real WhatsApp UI)
- Sending the message attaches the quote context

**User bot (automated mode):**
- The user bot LLM should have a `reply_to_message` action that takes a `targetMessageSid` and the reply text
- The bot should selectively use this when responding to a specific item within a multi-part coach message (e.g., coach lists three exercise options and user replies to one)

**Event payload:**
```json
{
  "type": "message",
  "fromUser": true,
  "body": "Yeah I'll try that",
  "quotedReply": {
    "targetMessageSid": "<sid of coach message>",
    "quotedBody": "How about starting with lunges?"
  },
  "timestamp": "<iso8601>"
}
```

---

### 4. Typing Indicators

**What it is:** WhatsApp shows a "typing..." indicator when the other party is composing. In real WhatsApp Business API, you can send a typing indicator event to the user before sending a message.

**Why it matters for testing:** The simulator renders typing indicators for the coach side already (presumably). What's new here is making the **user bot** emit typing indicators before sending, so the coach-side UI feels realistic — and so backends that key off typing signals can be tested.

**Two directions:**

- **User → Coach (inbound typing):** Before the user bot sends a message, it fires a `typing_start` event. When the message sends (or after a timeout), `typing_stop` fires. This is visible in the coach panel.
- **Coach → User (outbound typing):** When the coach backend sends a typing indicator (distinct from the actual message), the simulator renders it in the user panel as the familiar "..." bubble.

**Configuration:** Typing duration in automated mode should be proportional to message length (longer message = longer "typing" time) to feel natural during demos or observation.

---

### 5. Voice Notes

**What it is:** WhatsApp supports audio messages — users hold the mic button and send a voice recording. These arrive at the backend as media attachments with `audio/ogg` or `audio/mpeg` MIME type.

**Why it matters for testing:** Voice notes are a distinct media type that a backend might handle differently from text — potentially transcribing and routing through a different processing path. The simulator should be able to inject this type.

**UI (manual mode):**
- A mic button in the input bar
- Tester records directly in-browser (Web Audio API), or uploads an audio file as a proxy
- Playback preview before sending

**User bot (automated mode):**
- The user bot probably shouldn't generate real audio; instead, it should be able to send a **synthetic voice note** — a pre-recorded audio file attached to a message payload — when the eval spec calls for it
- The payload includes the audio as a media reference and an optional transcription field (so developer can observe backend transcription handling vs. pre-supplied text)

**Event payload:**
```json
{
  "type": "message",
  "fromUser": true,
  "mediaType": "audio/ogg",
  "mediaUrl": "<internal simulator media reference>",
  "transcription": null,
  "timestamp": "<iso8601>"
}
```

---

## User Bot Extensions

To support automated mode for the above features, the user bot's action space needs to expand beyond `send_message`. The bot's system prompt should describe each action clearly, including when it's appropriate to use each.

**New actions:**

| Action | Parameters | When to use |
|--------|------------|-------------|
| `react_to_message` | `targetMessageSid`, `emoji` | Emotional response; short acknowledgment without need for reply |
| `remove_reaction` | `targetMessageSid` | Changing mind; simulating retracted sentiment |
| `reply_to_message` | `targetMessageSid`, `body` | Responding to a specific item in a multi-part message |
| `send_voice_note` | `audioRef` (from eval spec assets) | When eval spec specifically calls for voice input |
| `mark_read` | `upToMessageSid` | Only in manual read-receipt mode when bot is controlling read state |

The LLM-as-judge eval rubric should be extended to assess whether the backend correctly interprets and responds to these richer signal types.

---

## Eval Spec Extensions (YAML)

The YAML-driven eval format should support WhatsApp-specific configuration:

```yaml
channel: whatsapp

whatsapp:
  read_receipts:
    mode: on_response  # auto_delay | manual | on_response
    auto_delay_ms: 2000  # only if mode is auto_delay

  user_bot:
    allow_reactions: true
    allow_quoted_replies: true
    allow_voice_notes: false  # requires audio assets
    voice_note_assets: []
```

---

## UI Changes

The WhatsApp simulator panel should visually distinguish itself from the SMS panel:

- **Message status ticks** on coach messages: single tick (sent), double tick (delivered), blue double tick (read) — updating in real-time as read receipt events fire
- **Reaction badges** on messages, visible on both sides
- **Quoted reply preview** in message bubbles when a reply targets a prior message
- **Typing indicator bubble** ("...") on both sides
- **Audio player** for voice note messages
- **Read receipt mode selector** in the session settings panel (auto-delay / manual / on-response)

The visual goal isn't pixel-perfect WhatsApp UI — it's enough fidelity that a developer observing a session immediately understands what user action is being simulated.

---

## Out of Scope (For Now)

- **Delivery receipts** (sent/delivered state): Simulator always delivers; these add no testing value
- **Failed messages**: Same reasoning — mock pipeline never fails
- **Template messages / quick-reply buttons**: Requires WhatsApp Business template approval infrastructure; separate concern
- **Group messaging**: Not a Delirio use case
- **Location sharing**: Low testing value for current product
- **Status (Stories)**: Not relevant to coaching channel

---

## Behavioral Decisions

**Read receipts mark all prior messages as read.** When a read event fires — regardless of trigger mode — all messages up to and including the most recent unread message are marked as read. This matches real WhatsApp behavior where opening a chat clears the entire unread stack.

**Voice note media storage is left to developer discretion.** Synthetic voice notes in automated mode reference audio assets declared in the eval spec. How those assets are stored and resolved during a session (in-memory, temporary local storage, etc.) is an implementation decision for the developer integrating the feature.

**User bot action weighting is eval-case-dependent.** How often the bot uses reactions, quoted replies, or voice notes in automated mode is not a global parameter — it's determined by the goal-conditioning in each individual eval spec. Some evals may call for heavy use of a particular action; others may never use it. The bot's system prompt should describe each action and when it's appropriate, but frequency is driven by the eval goal.

---

## Eval Process: SMS vs. WhatsApp

SMS and WhatsApp evals are related but distinct. **SMS is a strict subset of WhatsApp** — an SMS eval spec contains only text turns and the judge evaluates only text response quality. WhatsApp evals extend this with the full interaction surface.

**What this means in practice:**

- A WhatsApp eval run on a text-only conversation behaves identically to an SMS eval. There is no regression cost to using the WhatsApp channel for a text-only test.
- WhatsApp-specific evals are created explicitly when you want to test richer signal paths — e.g., "does the coach acknowledge a 🔥 reaction?", "does the coach use the quoted reply context when crafting its response?"
- The judge's input in a WhatsApp session includes a structured representation of the full interaction, not just message text. This means the judge can assess whether non-text user actions were handled correctly.

**Judge input structure for WhatsApp sessions:**

The judge receives a turn-by-turn log where each entry is typed — a text message, a reaction, a quoted reply, a voice note, a read receipt event, etc. The judge evaluates against the eval's criteria as always; the richer input just gives it more signal to work with. No separate scoring rubric is needed — the eval goal conditions what the judge looks for.
