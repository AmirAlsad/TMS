# Testing

This guide covers how to test your bot endpoint and verify TMS behavior after making changes.

## Quick Testing with Playground Mode

The fastest way to manually test:

1. Start the dev servers:
   ```bash
   pnpm dev
   ```
2. Open [http://localhost:5173](http://localhost:5173) in your browser
3. Select a channel (SMS or WhatsApp) from the UI
4. Type messages and observe your bot's responses in real time

Playground mode is useful for quick sanity checks -- verifying your bot responds, checking message formatting, and testing WhatsApp features like reactions and quoted replies visually.

## Testing with Existing Evals

Run the built-in eval specs to verify the example bot endpoint still works:

```bash
# Run a single eval
tms run example

# Run multiple evals
tms run cancel-appointment reschedule-appointment

# See the full conversation transcript
tms run example --verbose
```

If the example evals pass after your changes, you have not broken the core conversation loop, user bot, or judge.

## Writing a New Eval for a New Feature

1. **Create a YAML file** in `evals/`:

   ```yaml
   # evals/my-new-feature.yaml
   name: my-new-feature
   description: Test that the bot handles [your feature] correctly
   channel: sms

   userBot:
     goal: >
       You want to [describe what the user is trying to do].
       Your name is [name] and [relevant context].
     persona: >
       You're [describe communication style and behavior].

   requirements:
     - The bot should [expected behavior 1]
     - The bot should [expected behavior 2]
     - The conversation should [quality criterion]

   turnLimit: 10
   ```

2. **Add WhatsApp config** if testing WhatsApp features:

   ```yaml
   channel: whatsapp
   whatsapp:
     readReceipts:
       mode: on_response
     userBot:
       allowReactions: true
       allowQuotedReplies: true
       allowVoiceNotes: false
   ```

3. **Add hooks** if your test needs setup or teardown:

   ```yaml
   hooks:
     before: "node scripts/seed-test-data.js"
     after: "node scripts/cleanup.js"
   ```

4. **Run it** with verbose output to see the full transcript:

   ```bash
   tms run my-new-feature --verbose
   ```

5. **Review the results.** Each requirement gets a classification: `passed`, `needs_review`, or `failed`, with reasoning from the judge. Adjust your eval spec or bot behavior as needed.

For full eval spec reference, see [Eval System](evals.md).

## Batch Testing

Run all evals at once:

```bash
# Run all YAML specs in the evals directory
tms run evals/*.yaml

# Save results to a JSON file
tms run evals/*.yaml --output results.json

# Get structured JSON output on stdout (useful for piping)
tms run evals/*.yaml --json

# Run specs concurrently for faster execution
tms run evals/*.yaml --parallel
```

## CI Integration

Use the CLI exit codes to integrate evals into CI pipelines:

| Exit Code | Meaning |
|-----------|---------|
| 0 | All evals passed |
| 1 | At least one eval failed |
| 2 | At least one eval needs review (none failed) |
| 3 | Regression detected (with `--check-regression`) |

Example in a CI script:

```bash
# Start the server in the background
tms start &
TMS_PID=$!

# Wait for server to be ready
sleep 3

# Run evals and capture exit code
tms run evals/*.yaml --output results.json
EXIT_CODE=$?

# Stop the server
kill $TMS_PID

# Fail the build if evals did not pass
exit $EXIT_CODE
```

Or in a GitHub Actions workflow:

```yaml
- name: Run TMS evals
  run: |
    npx tms start &
    sleep 3
    npx tms run evals/*.yaml --output results.json
```

## Automated UI Testing with Playwright MCP

Beyond eval-based testing (which tests the conversation logic), you can use AI agents with the [Playwright MCP](https://github.com/anthropics/mcp-playwright) server to automate browser-based testing of the TMS client.

### What It Enables

An AI agent (such as Claude Code with a Playwright MCP server) can:

- Open the TMS client in a real browser
- Send messages through the UI and observe bot responses
- Verify WhatsApp features visually: reaction badges, quoted reply blocks, typing indicators
- Take screenshots to validate layout and styling
- Test interactive elements like the reaction picker, channel switcher, and message input

### Why It Is Useful

Eval-only testing validates the conversation and judgment layers but cannot catch UI bugs. Playwright MCP testing covers the full stack from browser to bot endpoint and back, catching issues like:

- Messages not rendering correctly
- WhatsApp UI components not appearing (reaction picker, quoted replies)
- WebSocket connection failures in the client
- CSS/layout regressions

### How to Set It Up

1. Add the Playwright MCP server to your Claude Code or AI agent configuration
2. Start the TMS dev servers: `pnpm dev`
3. Point the agent at the TMS client URL: `http://localhost:5173`

### Example Workflow

An agent-driven test session might look like:

1. Agent opens `http://localhost:5173` in the browser
2. Agent selects the WhatsApp channel from the UI
3. Agent types a message in the input field and sends it
4. Agent verifies the bot response appears in the message panel
5. Agent hovers over a bot message to test the reaction picker
6. Agent clicks a reaction emoji and verifies the reaction badge appears
7. Agent takes a screenshot for visual regression comparison

### Combining with Evals

Use both approaches for comprehensive coverage:

- **Evals (CLI)**: Test conversation logic, tool usage, and requirement satisfaction headlessly
- **Playwright MCP**: Test UI rendering, interactivity, and visual behavior in a real browser

## Quick Reference

| Task | Command |
|------|---------|
| Start dev servers | `pnpm dev` |
| Run a single eval | `tms run <name>` |
| Run multiple evals | `tms run <name1> <name2>` |
| Run all evals | `tms run evals/*.yaml` |
| Verbose output | `tms run <name> --verbose` |
| JSON output to stdout | `tms run <name> --json` |
| Save JSON report | `tms run <name> --output report.json` |
| Run evals concurrently | `tms run <names...> --parallel` |
| Run a suite | `tms run --suite <name>` |
| Comparative runs | `tms run <name> --runs 5` |
| Check for regressions | `tms run <names...> --check-regression` |
| Custom config | `tms run <name> -c path/to/config.yaml` |
| Type check all packages | `pnpm typecheck` |
| Lint all packages | `pnpm lint` |
| Build all packages | `pnpm build` |
