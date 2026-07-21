# OMP connections to Discord and Telegram
<!-- markdownlint-disable MD013 -->

_Research date: 2026-07-20._

## Recommendation

Use one of these paths, in order:

1. **Observation or occasional remote access:** use OMP's first-party `/collab view` or read-write `/collab`, then share the generated browser link privately. OMP seals frames client-side; the relay does not see the keys. A read-write link still grants broad control and must be treated like an SSH credential ([OMP collaboration](https://github.com/can1357/oh-my-pi#07--hand-someone-the-link-theyre-in)).
2. **Notifications only:** add a small OMP extension that listens for `agent_end`, errors, or shutdown and posts a redacted summary through a Discord incoming webhook or Telegram `sendMessage`. This creates no inbound remote-control path ([OMP extensions](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md); [Discord webhooks](https://discord.com/developers/docs/resources/webhook); [Telegram `sendMessage`](https://core.telegram.org/bots/api#sendmessage)).
3. **Native two-way chat:** use a private Telegram DM bot with long polling, or a private Discord bot over the Gateway, backed by a dedicated sandboxed `omp --mode rpc` child. OMP RPC is an NDJSON-over-stdio interface designed for process-isolated hosts and exposes prompts, events, session control, and extension UI requests ([OMP RPC](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)).

Do not attach an inbound bridge to the current OMP profile unchanged. This repository currently sets `tools.approvalMode: yolo` and `task.isolation.mode: none`; a remote prompt would inherit broad file, process, network, and subagent authority.

## Official OMP integration surfaces

OMP is a Pi fork, not OpenCode ([OMP README](https://github.com/can1357/oh-my-pi#readme)). Its supported embedding surfaces are:

- The in-process TypeScript SDK, including `createAgentSession`, `SessionManager`, event subscriptions, and `session.prompt(...)` ([OMP SDK](https://github.com/can1357/oh-my-pi/blob/main/docs/sdk.md)).
- `omp --mode rpc`, which runs NDJSON over stdin/stdout and supports prompting, streaming events, aborts, sessions, state, and extension UI round trips ([OMP RPC](https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md)).
- ACP for editor clients and `/collab` for live shared sessions.

OMP has no documented first-party HTTP session server. For a bot, RPC is preferable to the SDK because a child-process boundary is easier to supervise and isolate. Never expose raw RPC: its command union includes direct `bash`, session paths, and model/auth controls.

## Platform choices

### Telegram

Telegram is the simpler native mobile control surface for one operator:

- `getUpdates` long polling requires no public listener, cannot be used simultaneously with webhooks, and requires advancing the update offset to avoid duplicates ([Telegram `getUpdates`](https://core.telegram.org/bots/api#getupdates)).
- Authorize exact numeric `from.id` and `chat.id` values before parsing any command.
- Map `(chat.id, message_thread_id, user.id)` to one OMP child/session and serialize prompts per session.
- Coalesce updates and split final output below Telegram's 4,096-character `sendMessage` limit ([Telegram `sendMessage`](https://core.telegram.org/bots/api#sendmessage)).

### Discord

Discord works well when projects and sessions naturally map to channels and threads:

- Prefer a private bot using the Gateway WebSocket; it avoids public ingress but requires heartbeat/reconnect/resume handling ([Discord Gateway](https://discord.com/developers/docs/events/gateway)).
- Prefer slash commands over arbitrary message ingestion. HTTP interactions require a public endpoint, raw-body Ed25519 signature validation, and acknowledgement or deferral within three seconds ([Discord interactions](https://discord.com/developers/docs/interactions/receiving-and-responding)).
- Authorize immutable application, guild, channel, thread, and user IDs—not names or roles alone.
- Disable unexpected mentions with `allowed_mentions` and split normal message output below 2,000 characters ([Discord messages](https://discord.com/developers/docs/resources/message#create-message)).

## Community packages

These are Pi community packages, not first-party OMP integrations. OMP compatibility is unverified; pin versions, audit source and dependencies, and test in a disposable OMP agent directory.

- [`@llblab/pi-telegram`](https://pi.dev/packages/@llblab/pi-telegram) is the strongest Telegram candidate. It uses private-DM owner pairing and long polling, provides queue/session controls, and explicitly avoids PTY or arbitrary terminal exposure. Its package currently peers against the Earendil Pi packages rather than `@oh-my-pi/pi-coding-agent`, so treat it as a compatibility experiment rather than a drop-in.
- [`@mporenta/pi-discord-remote`](https://pi.dev/packages/@mporenta/pi-discord-remote) provides required user/channel allowlists and per-session Discord threads. Its own documentation correctly warns that an authorized user effectively has keyboard-level machine access.
- [`@gamalan/pi-gateway`](https://pi.dev/packages/@gamalan/pi-gateway) supports both platforms and per-chat sessions, but its documented defaults are unsuitable here: `allowAll: true`, empty HTTP/WS bearer tokens, CORS `*`, and tool restrictions implemented as prompt guidance rather than a hard execution boundary.

## Secure bridge shape

```text
Telegram long polling or Discord Gateway
  -> exact numeric allowlist + replay/deduplication
  -> fixed commands: prompt, status, abort, new
  -> per-session FIFO
  -> dedicated OS identity/container + disposable worktree
  -> restricted OMP config + omp --mode rpc child
  -> coalesced status and final response
```

Requirements:

1. Never forward caller-supplied RPC JSON, shell commands, session paths, arbitrary slash commands, model/provider IDs, or approval responses.
2. Use deterministic tool denies. If remote coding needs `bash` or writes, contain damage with an OS/container boundary rather than a system prompt.
3. Keep bot tokens outside source, redact logs, and provide a local kill switch for the bridge and all OMP children.
4. Assume all text and files sent to Discord or Telegram have left the workstation trust boundary.
5. For outbound-only notifications, redact reasoning, raw tool arguments, diffs, environment values, and credentials.
