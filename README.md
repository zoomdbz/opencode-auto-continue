# opencode-auto-continue

OpenCode plugin that automatically sends a continuation prompt when agent sessions go idle, keeping long-running tasks moving without manual intervention.

## This fork

Fork of [hjzccc/opencode-auto-continue](https://github.com/hjzccc/opencode-auto-continue) **updated for the opencode 2 plugin API.** opencode 2 rewrote the plugin contract (a `Plugin.define({ id, setup })` default export built against `@opencode/plugin@2`); the original targets opencode 1 (`@opencode-ai/plugin ^1`) and fails to load on opencode 2. Idle detection now uses `ctx.event.subscribe`, messages are read with `ctx.session.context`, and the continuation is sent with `ctx.session.prompt` (which uses the session's current agent/model). Cooldown, max-consecutive, dedupe, and idle-reset behavior are unchanged.

## Install

Build the plugin, then point your opencode 2 config at the package directory (opencode 2 loads a local plugin from its package directory, reading `package.json` `main`):

```bash
npm install && npm run build
```

```json
{
  "plugin": [
    "/absolute/path/to/opencode-auto-continue"
  ]
}
```

## How It Works

When an OpenCode session emits a `session.idle` event, the plugin automatically injects a continuation message (default: `"continue"`) to resume the agent. This is useful for multi-step tasks where the agent pauses between steps waiting for user input.

**Key behaviors:**
- Listens for `session.idle` events (and cleans up state on `session.deleted`)
- Skips if an injection is already in flight, or if it already fired for the current assistant turn (dedupe by last assistant message id)
- Respects a cooldown period between consecutive injections, deferring the injection until the cooldown elapses
- Caps the maximum number of consecutive auto-continues to prevent infinite loops
- Resets the consecutive counter when the user sends a real (non-continue) message
- Sends the continuation to the session's current agent and model (opencode 2 `session.prompt` no longer takes an explicit agent/model)

## Configuration

Create `.opencode/auto-continue.json` (or `.jsonc`) in your project root:

```json
{
  "enabled": true,
  "message": "continue",
  "cooldown_ms": 10000,
  "max_consecutive": 5
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable/disable the plugin. **Must be explicitly enabled.** |
| `message` | `string` | `"continue"` | The text injected as a user message |
| `cooldown_ms` | `number` | `10000` | Minimum ms between consecutive injections |
| `max_consecutive` | `number` | `5` | Max consecutive auto-continues before stopping |

You can also set these inline as opencode plugin options (tuple form), which override the file:

```json
{
  "plugin": [
    ["/absolute/path/to/opencode-auto-continue", { "enabled": true, "message": "continue" }]
  ]
}
```

## License

MIT
