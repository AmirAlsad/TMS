# TMS: Text Messaging Simulator

## What It Is

TMS is an open-source tool for testing and evaluating conversational AI through a simulated text messaging interface. It provides a web UI that displays conversations in a familiar phone-style chat layout alongside real-time logs, supporting both manual interaction (playground mode) and automated evaluation runs driven by a "user bot."

TMS doesn't care what your bot is built with. It talks to any conversational API through configurable endpoints — you point TMS at your bot, and it handles the rest.

---

## The Problem

Conversational AI developers typically test their bots in one of two ways: manually sending messages through real messaging platforms (slow, expensive, not reproducible) or writing unit tests that verify isolated functions (fast, but doesn't reflect real user experience). Neither approach answers the question that actually matters: **does the conversation work?**

A user doesn't interact with a function — they have a multi-turn exchange where each message depends on the last. The bot's behavior is shaped by accumulated context, backend state, and the unpredictable ways real people communicate. Testing this requires running actual conversations end-to-end and evaluating the results.

TMS fills this gap. It simulates text messaging conversations against your bot, lets you observe what's happening in real time, and — when you're ready — automates the process with LLM-driven evaluations.

---

## Core Concepts

### Configurable Endpoints

TMS is endpoint-driven. It doesn't embed any bot logic or make assumptions about your backend. You configure:

- **Bot endpoint** — Where TMS sends user messages and receives bot responses. This is any HTTP endpoint that accepts a message and returns a reply. Could be an OpenAI assistant, a LangChain agent, a custom API — anything.
- **User bot endpoint** *(automated mode only)* — Where TMS gets simulated user messages during automated evaluations. This can be a separate service you run, or TMS can use a built-in user bot powered by a configurable LLM.
- **Logs endpoint** *(optional)* — TMS can receive log data pushed from your backend services. If your system sends logs to TMS, they appear in real time alongside the conversation.

### Simulated Channels

TMS simulates text messaging channels. The selected channel is passed to your bot endpoint as a parameter, allowing your bot to adjust its behavior accordingly (e.g., shorter messages for SMS, richer formatting for WhatsApp).

Supported channels:

| Channel | Description |
|---|---|
| **SMS** | Standard text messaging simulation |
| **WhatsApp** | WhatsApp-style messaging simulation |

The channel affects both the visual rendering in TMS's UI and the parameter sent to your bot, but TMS itself doesn't route through any real messaging provider.

### The User Bot

The user bot is an LLM that simulates a real user during automated evaluations. Rather than following a rigid script, it pursues a goal — like "ask the bot to schedule a meeting for next Tuesday" — and adapts to whatever the bot says.

This matters because bots are non-deterministic. If your bot asks an unexpected clarifying question, a scripted test breaks. A goal-oriented user bot handles this naturally.

The user bot's behavior is controlled by two layers:

1. **Base system prompt** — Shared across all evaluations. Tells the user bot to behave like a real person: stay on goal, be realistic (not overly articulate), and respond naturally.
2. **Evaluation-specific instruction** — Defined in each YAML eval spec. Describes the specific goal, persona, and context for this particular evaluation.

A smaller, cheaper LLM (e.g., Claude Haiku) works well for the user bot. It doesn't need to be sophisticated — it needs to be plausible.

#### Wait Handling

Some bot interactions involve background processing that takes time. The bot might acknowledge a request ("Working on that...") and then follow up later with the result.

The user bot must be able to **not respond** — to recognize when it should wait for the next bot message rather than sending another message. This prevents infinite back-and-forth loops while a background process is running. A configurable timeout flags cases where the bot never follows up, marking the evaluation as potentially failed.

---

## Evaluation System

### Evaluation Specs (YAML)

Each automated evaluation is defined in a YAML file:

```yaml
name: schedule-meeting-polite-user
description: Test that the bot can handle a meeting scheduling request from a polite, cooperative user
channel: sms

user_bot:
  goal: >
    You want to schedule a team meeting for next Tuesday at 2pm.
    There will be 5 attendees. You want it to last 1 hour.
  persona: >
    You're polite and cooperative. You answer questions directly
    but don't volunteer extra information unless asked.

requirements:
  - The bot should confirm the meeting details before scheduling
  - The bot should ask about all necessary details (date, time, duration, attendees)
  - The conversation should feel natural, not like a form fill
  - The bot should not assume information that wasn't provided

turn_limit: 15
```

The YAML spec contains:

- **Goal** — What the user bot is trying to accomplish.
- **Persona** — How the user bot should behave (communication style, cooperativeness, quirks).
- **Channel** — Which messaging channel to simulate.
- **Requirements** — Specific criteria the LLM judge evaluates against.
- **Turn limit** — Maximum conversation turns before the evaluation is force-stopped.
- **Lifecycle hooks** *(optional)* — Setup and teardown commands to run before and after the evaluation (see [Lifecycle Hooks](#lifecycle-hooks)).

### LLM-as-Judge Classification

After an evaluation completes, the full transcript and requirements are sent to an LLM judge. Rather than producing a numeric score (which tends to cluster around 7/10 and is hard to act on), the judge classifies each requirement into one of three categories:

| Classification | Meaning | Action |
|---|---|---|
| **Passed** | Requirement clearly met | No action needed |
| **Needs Review** | Ambiguous — might be fine, might not | Human reviews the transcript |
| **Failed** | Requirement clearly not met | Investigate and fix |

The overall evaluation result is determined by its worst classification. If any requirement fails, the evaluation fails. If any requirement needs review and none failed, the evaluation needs review.

This three-tier system keeps signal clean: failures demand attention, edge cases surface for review, and passing evaluations build confidence.

---

## Lifecycle Hooks

Some bots depend on backend state — database records, user profiles, configuration — that affects how they behave. For evaluations to be reproducible, you may need to reset that state to a known starting point before each run.

TMS handles this through **lifecycle hooks**: optional shell commands that run at specific points in the evaluation lifecycle.

```yaml
hooks:
  before: "python scripts/reset_test_user.py --fixture new_user"
  after: "python scripts/cleanup.py"
```

- **`before`** — Runs before the evaluation starts. Use it to set up your database, seed test data, reset state, or anything else your bot needs to start from a known condition.
- **`after`** — Runs after the evaluation ends. Use it to tear down test data, capture final state for inspection, or trigger cleanup.

Hooks are optional. If your bot is stateless or you don't need reproducible starting conditions, skip them. TMS doesn't know or care what your hooks do — it just calls them at the right time.

---

## User Interface

TMS provides a web-based UI with two panels:

### Left Panel: Message Display

A phone-style chat display showing the conversation as it would appear on a real device:

- Chat bubbles for both user and bot messages
- Visual styling matching the simulated channel (SMS or WhatsApp)
- Timestamps and delivery indicators
- In automated mode, messages from the user bot appear as they're generated
- In playground mode, a text input lets you type messages directly

### Right Panel: Logs

A real-time log viewer showing backend activity alongside the conversation:

- Logs are pushed to TMS from your backend via the logs endpoint
- Synchronized with the message display — backend activity appears alongside the message that triggered it
- Errors, warnings, and timing information are visually distinguished

#### Standard Log Format

TMS defines a standard log representation for consistency across different backends. Logs pushed to TMS should conform to this format:

```json
{
  "timestamp": "2026-03-05T14:30:00.000Z",
  "level": "info",
  "source": "chat-engine",
  "message": "Processing user message",
  "data": {}
}
```

| Field | Required | Description |
|---|---|---|
| `timestamp` | Yes | ISO 8601 timestamp |
| `level` | Yes | `debug`, `info`, `warn`, or `error` |
| `source` | Yes | Identifier for the service producing the log |
| `message` | Yes | Human-readable log message |
| `data` | No | Arbitrary JSON object with additional context |

The log panel is available whenever logs are being sent. If no logs endpoint is configured or no logs are received, the right panel simply remains empty — TMS still functions fully as a messaging simulator without it.

---

## Modes of Operation

### Playground Mode

The simplest way to use TMS. No YAML, no automation — just you and your bot.

1. Configure your bot endpoint.
2. Select a simulated channel (SMS or WhatsApp).
3. Type messages into the phone display and receive real bot responses.
4. Observe logs in real time (if configured).

This is the minimum viable TMS experience. You can be up and running with nothing more than a bot endpoint URL.

### Automated Mode

Driven by YAML evaluation specs:

1. Run any configured lifecycle hooks (`before`).
2. Initialize the user bot with the goal and persona from the spec.
3. Run the conversation loop:
   - User bot sends a message → Bot responds → User bot responds → Repeat
   - User bot holds when waiting for background processes
   - Loop ends when the user bot determines its goal is achieved or the turn limit is reached
4. Send the full transcript and requirements to the LLM judge.
5. Receive classifications (Passed / Needs Review / Failed) for each requirement.
6. Run any configured lifecycle hooks (`after`).
7. Display results in the UI.

Multiple evaluations can be run in sequence.

---

## Getting Started

### Minimum Setup

The simplest TMS setup requires one thing: a bot endpoint.

1. Install and start TMS.
2. Configure your bot endpoint URL.
3. Open the UI, select a channel, and start typing.

That's playground mode. No YAML, no user bot, no logs, no hooks.

### Adding Automation

To run automated evaluations:

1. Configure a user bot (either TMS's built-in LLM user bot with an API key, or point to your own user bot endpoint).
2. Write a YAML evaluation spec with a goal, persona, and requirements.
3. Run the evaluation from the UI or CLI.
4. Review the LLM judge's classifications.

### Adding Logs

To see backend activity alongside conversations:

1. Configure the TMS logs endpoint in your backend services.
2. Push logs in the standard format during bot processing.
3. Logs appear automatically in the right panel.

### Adding State Management

To ensure reproducible starting conditions:

1. Write setup/teardown scripts for your backend.
2. Reference them as lifecycle hooks in your YAML specs.
3. TMS calls them automatically before and after each evaluation.

---

## Roadmap

### Phase 1: Core

- Configurable bot endpoint integration
- Two-panel web UI (message display + log viewer)
- Playground mode with channel selection (SMS, WhatsApp)
- Standard log ingestion format
- Manual testing without any automation or configuration files

### Phase 2: Automation

- Built-in user bot with configurable LLM
- YAML evaluation spec parser
- User bot wait handling for background processes
- Lifecycle hooks (before/after)
- Conversation loop runner

### Phase 3: Evaluation Intelligence

- LLM-as-judge classification system (Passed / Needs Review / Failed)
- Evaluation results storage and review interface
- Batch evaluation runs (sequential)

### Phase 4: CI Integration

- CLI runner for headless evaluation execution
- CI-compatible output format (exit codes, structured reports)
- Parallel evaluation execution

---

## Design Decisions

**Why simulate channels instead of using real messaging providers?**
Speed, cost, and accessibility. Real messaging adds latency, costs per message, and requires provider accounts. TMS passes a channel parameter to your bot so it can adjust behavior — you get the same prompt and formatting logic without infrastructure overhead.

**Why a cheaper LLM for the user bot?**
The user bot needs to be realistic, not brilliant. Real users are vague, terse, and imprecise. A smaller model like Claude Haiku simulates this well, and the cost savings matter when you're running hundreds of evaluations.

**Why three-tier classification instead of numeric scoring?**
LLM judges producing numeric scores tend to cluster around 7/10 regardless of quality. Three tiers force a clear signal: it passed, it needs a look, or it broke. This makes evaluation results actionable instead of ambiguous.

**Why lifecycle hooks instead of a built-in fixture system?**
Every project uses different backends — Firestore, Postgres, MongoDB, Redis, flat files, or nothing at all. TMS can't anticipate your stack. Lifecycle hooks let you run whatever setup and teardown logic you need without TMS making assumptions about your infrastructure.

**Why endpoint-driven instead of embedding bot logic?**
TMS tests conversations, not bots. By talking to your bot through a standard HTTP interface, it works with any conversational AI regardless of framework, language, or architecture. Your bot is a black box — TMS only cares about the messages going in and coming out.
