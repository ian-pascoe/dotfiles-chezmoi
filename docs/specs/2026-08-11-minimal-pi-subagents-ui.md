---
title: Minimal Pi Subagents UI
artifact_contract: implementation-spec/v1
artifact_readiness: implementation-ready
decision_status: confirmed
date: 2026-08-11
topic: minimal-pi-subagents-ui
execution: code
---
<!-- markdownlint-disable MD013 MD025 MD036 -->

# Minimal Pi Subagents UI

## Purpose

Give the local minimal-subagents extension a compact native Pi interface: collapsible tool rows, distinct coordinator messages, an active hierarchy widget, and a footer status. Keep model-visible behavior aligned with the authoritative six-tool public surface.

The decisions in this specification were confirmed in the UI design session on 2026-08-11.

## Authority and Baseline

**Baseline:** Read [`2026-08-11-minimal-pi-subagents-extension.md`](./2026-08-11-minimal-pi-subagents-extension.md) before changing coordinator state, persistence, delivery, restoration, fork behavior, or tool results. That specification remains authoritative for subagent behavior.

This specification supersedes only these baseline UI decisions:

- The fleet-widget non-goal.
- The notification-only requirement in **Status and Monitoring**.
- The existing `TurnResult`, persisted-agent, summary, and coordinator-message contracts only where this specification adds optional presentation metadata.

If the specifications otherwise conflict, preserve the baseline behavior. UI state must remain a projection of coordinator state, never a second source of truth.

## Goals

- Make all six root coordinator tools legible when Pi tool output is collapsed.
- Make expanded output useful for diagnosis without presenting routine raw JSON.
- Render explicit agent messages and automatic agent results as distinct transcript items.
- Show active nested work and recent outcomes above the editor.
- Show a small running/retained aggregate in Pi's footer.
- Preserve useful task and duration metadata across root-session restoration and fork cloning.
- Keep terminal presentation responsive, theme-aware, and lifecycle-safe.
- Preserve machine-readable tool content, model context, and non-TUI behavior.

## Non-goals

- An interactive fleet dashboard, modal, inspector, transcript browser, or custom navigation mode.
- Extension-specific keybindings, commands, cancellation controls, or widget visibility controls.
- A replacement header, footer, working indicator, or full-screen application shell.
- Raw model thinking, child transcript streaming, or a live tool-call feed from child sessions.
- Changing coordinator behavior beyond the authoritative extension specification.
- Persisting presentation state such as expansion, widget visibility, row selection, or cooldown deadlines.
- Making color the sole carrier of state.
- Adding UI dependencies beyond Pi's coding-agent and TUI packages.

## UI Vocabulary

Use one visual grammar everywhere:

```text
<symbol> <action or identity> · <explicit status> · <key detail>
```

### State Symbols

| State | Symbol | Theme role | Required word |
| --- | --- | --- | --- |
| Running | `◉` | `accent` | `running` |
| Waiting | `◌` | `accent` | `waiting` |
| Completed/success | `✓` | `success` | `completed`, `delivered`, or the successful action |
| Failed | `×` | `error` | `failed` |
| Cancelled | `■` | `warning` | `cancelled` |
| Interrupted | `!` | `warning` | `interrupted` |
| Unavailable | `!` | `warning` | `unavailable` |
| Message | `→` | `accent` | `delivered` or `message` |
| Idle with no result | `○` | `dim` | `idle` |

Symbols and colors reinforce explicit words; they never replace them. Use Pi theme roles through `theme.fg()` and native emphasis methods. Do not embed fixed ANSI color codes.

### Text Rules

- Show canonical IDs after the coordinator has allocated them.
- Before allocation, show the requested friendly ID or `generated`.
- Collapsed message and task previews occupy one terminal line and use width-aware truncation.
- Expanded tasks and successful outputs are complete, not character-truncated.
- Format durations as compact units such as `830ms`, `12s`, `2m 08s`, or `1h 04m`.
- Format token counts with compact decimal suffixes such as `950`, `12.4k`, and `1.2m`.
- Use `keyHint("app.tools.expand", "to expand")` wherever a collapsed result has material expanded content. Never hard-code `Ctrl+O` in rendered output.

## Additive Data Contract

### Persisted Agent Metadata

Extend `PersistedAgent` with these optional fields:

```ts
interface PersistedAgent {
  /** Exact first task supplied when this persistent agent was created. */
  task?: string;
  /** Timestamp of the most recent create/start/settle/availability activity. */
  latest_activity_at?: string;
}
```

For newly created agents:

- Store `task` exactly once from `SpawnParameters.task` before writing `agent-created`.
- Initialize `latest_activity_at` to `created_at`.
- Update `latest_activity_at` when a turn starts or settles and when restoration changes availability.
- Preserve both fields through checkpoints and fork snapshots.

For old registry entries:

- Missing `task` and `latest_activity_at` remain valid.
- Render an absent task as no preview; do not infer it from a transcript.
- Fall back to `created_at` when ordering an agent with no `latest_activity_at`.

Registry event version remains version 1 because replay already treats the agent payload structurally and the new fields are optional. Do not rewrite old entries.

### Turn Duration

Extend `TurnResult` additively:

```ts
interface TurnResult {
  elapsed_ms?: number;
}
```

At settlement, calculate duration from the persisted active-turn start timestamp and the coordinator's injected clock before clearing `active_turn_started_at`. Apply this to completed, failed, cancelled, and interrupted outcomes. If no valid start exists, omit the field.

Persist the duration in `turn-settled`; preserve it through replay, wait results, detailed status, delivery recovery, and fork checkpoints.

### Status Projection

Extend `AgentSummary` additively:

```ts
interface AgentSummary {
  task?: string;
  latest_activity_at?: string;
}
```

- `task` is the original persisted task.
- `elapsed_ms` remains live duration for running agents and uses `latest_result.elapsed_ms` for idle agents with a terminal result.
- `latest_activity` remains the concise human-readable activity description.
- `latest_activity_at` is the sortable timestamp.

### Coordinator Message Metadata

Extend message details additively:

```ts
interface CoordinatorMessageDetails {
  source_agent_id: string;
  destination_agent_id?: string;
  source_turn_id: string;
  status?: TurnStatus;
  elapsed_ms?: number;
  usage?: Usage;
}
```

Set `destination_agent_id` on every explicit and automatic delivery. Automatic result messages also carry terminal status, duration, and usage when available. Delivery-evidence matching continues to depend only on source agent ID and source turn ID.

These fields are metadata on existing custom messages. They do not alter message content or create extra model-context entries.

## Tool Rendering Contract

### Native Pi Integration

Every definition returned by `createCoordinatorToolDefinitions()` must provide purpose-specific `renderCall` and `renderResult` functions.

- Use Pi's ordinary padded tool shell; do not set `renderShell: "self"`.
- Return `Text`, `Container`, `Spacer`, or `Markdown` components with zero internal outer padding.
- Respect `renderResult`'s `expanded` and `isPartial` options.
- Treat `result.details` as untrusted optional data. A missing or incompatible details object falls back to the first text content item.
- Style `result.isError` fallback content with the error theme role.
- Keep the current `content` and `details` returned by `execute()` machine-readable and unchanged except for the additive fields in this specification.
- Render successful child output with `Markdown` and Pi's `getMarkdownTheme()`.
- Show raw serialized diagnostics only for errors or malformed details. Successful expanded results use curated sections.

### Common Collapsed Shape

Collapsed final results fit the shared grammar on one logical row. Append a dim native expansion hint when expanded content exists.

Examples:

```text
◉ researcher · running
→ researcher · delivered · steer
✓ researcher · completed · 1.8k tokens
○ 4 children · 0 running
■ researcher · 2 turns cancelled
✓ researcher · 3 agents deleted
```

### `subagent`

**Call**

```text
Subagent <requested-friendly-id | generated> · “<one-line task preview>”
```

**Collapsed result**

```text
◉ <canonical-agent-id> · running
```

**Expanded result sections**

1. Canonical agent and turn IDs.
2. Full task.
3. Effective model and thinking level when available from the call parameters/status projection.
4. Session-context and project-context modes.
5. Resolved ordinary tools.

The spawn result does not wait for child completion and must not imply completion.

### `agent_message`

**Call**

```text
Message <direct-relative-canonical-id | parent> · “<one-line message preview>”
```

**Collapsed result**

```text
→ <canonical-agent-id> · delivered
```

Use `×` and `failed` when the recipient does not accept the message.
Historical results retain their recorded `steer` or `follow-up` label when present.

**Expanded result sections**

1. Full message.
2. The single recipient and any actionable delivery error.

### `subagent_wait`

**Call**

```text
Wait <canonical-agent-id>
```

Use the tool's `onUpdate` callback for a partial result while blocked. Emit an initial partial result, then update elapsed time once per second. The interval is local to that tool execution and is cleared in `finally` on result, timeout, caller abort, or error.

**Partial result**

```text
◌ <canonical-agent-id> · waiting · <elapsed>
```

If partial updates prove incompatible with Pi's tool lifecycle, preserve a static waiting partial row rather than adding another global mechanism.

**Collapsed terminal result**

```text
<terminal-symbol> <canonical-agent-id> · <terminal-status> · <duration> · <total tokens>
```

Omit unavailable metrics rather than displaying placeholders.

**Expanded terminal result sections**

1. Agent and turn IDs, terminal status, and duration.
2. Complete output as Markdown for successful completion.
3. Error text and raw diagnostic payload for failure.
4. Usage: input, output, cache read, cache write, and total tokens; include total cost only when Pi supplies a nonzero value.

### `subagent_status`

**Call**

- Omitted ID: `Status children`
- Explicit ID: `Status <canonical-agent-id>`

**Collapsed child-list result**

```text
○ <children> children · <running> running
```

**Expanded child-list result**

Render only the caller's direct children as a flat list. Every row includes identity, explicit state, availability when unavailable, live/terminal duration when known, and child count when nonzero. Nested child records are not rendered through the public tool.

**Collapsed detail result**

```text
<state-symbol> <canonical-agent-id> · <state/status> · <child-count> children
```

**Expanded detail sections**

1. Identity, parent, state, availability, active/latest turn, and duration.
2. Full original task when available.
3. Launch contract: context modes, model, thinking level, and ordinary tools.
4. Capability ceiling and missing dependencies.
5. Latest result as Markdown or error diagnostics.
6. Recent messages.
7. Agent usage.
8. Session path and spawn entry ID.

### `subagent_cancel`

**Call**

```text
Cancel <canonical-agent-id> · <recursive | target only>
```

**Collapsed result**

- Work cancelled: `■ <canonical-agent-id> · <N> turns cancelled`
- Idle no-op: `✓ <canonical-agent-id> · no active turns`

**Expanded result sections**

1. Requested target and recursive mode.
2. Every affected agent ID.
3. Every cancelled turn ID.

### `subagent_delete`

**Call**

```text
Delete <canonical-agent-id> · <recursive | target only>
```

**Collapsed result**

```text
✓ <canonical-agent-id> · <N> agents deleted · <M> tombstoned
```

A partial failure uses `×`, the word `failed`, and the success/failure counts.

**Expanded result sections**

1. Requested target and recursive mode.
2. Deleted agent IDs in post-order.
3. Tombstoned IDs.
4. Trashed session paths.
5. Every failure, displayed prominently with raw diagnostic data.

## Custom Message Rendering

Register renderers for both existing custom types during extension registration:

- `minimal-subagents.message` → **Agent message**
- `minimal-subagents.result` → **Agent result**

Use `pi.registerMessageRenderer()`. Use Pi's `customMessageBg` shell convention with `Box(outputPad, 1, ...)`, matching native custom-message presentation.

### Collapsed Explicit Message

```text
→ Agent message · <source> → <destination>
  <one-line content preview>
```

### Expanded Explicit Message

Show the same heading, complete message content, source turn ID, and available delivery metadata.

### Collapsed Automatic Result

```text
✓ Agent result · <source> → <destination> · completed
  <one-line output preview>
```

### Expanded Automatic Result

Show:

1. Source, destination, source turn, status, and duration.
2. Complete output as Markdown.
3. Usage using the same formatter as wait/status output.

Malformed or older messages without new metadata still render their content and available source fields. Message rendering never changes the custom message stored in context.

## Hierarchy Widget

### Placement and Keys

- Widget key: `minimal-subagents`
- Placement: `aboveEditor`
- Footer status key: `minimal-subagents`

The widget is presentation-only. Derive every refresh from trusted internal `coordinator.inspectStatus()` with no agent ID; do not use the caller-scoped `subagent_status` projection.

### Visibility

Show the widget when either condition holds:

1. At least one agent has an active turn.
2. The ten-second terminal cooldown is active.
3. An unavailable agent was surfaced during the current session's restoration cooldown.

When the last active turn settles, retain the current active/recent projection for ten seconds, then clear the widget. Starting another turn cancels and replaces the cooldown. On a root restoration with no active turns, show unavailable agents for one ten-second cooldown; do not resurrect ordinary old completions solely to show the widget.

Hide the footer status whenever no agent is running, even while the cooldown widget remains visible.

### Heading

```text
Subagents · <running> running · <recent> recent
```

Use singular grammar for one agent. `recent` is the number of selected terminal/unavailable outcome rows, not total retained agents.

### Row Selection

Build the widget projection in this order:

1. Select every running agent.
2. Include each running agent's ancestor chain so nesting remains understandable.
3. Select up to three non-running outcome rows by descending terminal `latest_activity_at`; use `created_at` as fallback. Include unavailable agents as terminal attention rows. A failure wins an exact timestamp tie.
4. Include only ancestors required to place those three recent rows.
5. Preserve depth-first hierarchy order in the rendered projection.
6. Mark structural-only ancestors so they omit task previews.
7. Cap agent rows at eight. Prioritize running rows, unavailable/failed rows, required ancestors, then other recent outcomes.
8. Append `… +N more` when selected rows exceed the cap.

Deleted agents are absent from coordinator status and therefore absent from the widget. Their tool result remains in the transcript.

### Agent Rows

A meaningful active/recent row contains:

```text
<tree-indent><symbol> <canonical-agent-id> · <explicit-status> · <elapsed> · <task-preview>
```

A structural ancestor contains only identity and state. Use tree indentation that remains legible at narrow widths; do not spend columns on decorative borders.

### Responsive Component

Implement the widget as a component factory rather than precomputed string lines so `render(width)` can truncate task previews safely.

- Every rendered line must satisfy `visibleWidth(line) <= width`.
- Use Pi TUI's `truncateToWidth()` for width-aware ANSI-safe truncation.
- The component reads an immutable widget-view snapshot from its controller.
- A snapshot update calls `tui.requestRender()`.
- Avoid cached theme output; if caching is introduced, invalidate it on theme changes.
- The component has no keyboard handling or selection state.

## Footer Status

While one or more agents run, set:

```text
◉ <running> running · <retained> retained
```

Use the accent theme role. `retained` counts all non-deleted agents in the rooted hierarchy, not only visible widget rows.

Clear the status with `ctx.ui.setStatus("minimal-subagents", undefined)` as soon as no agent runs and during shutdown.

## UI Controller and Lifecycle

Create one root-session-scoped UI controller after coordinator restoration during `session_start`. The controller owns only presentation state:

- Current immutable hierarchy projection.
- Mounted widget component reference, if any.
- One one-second live refresh interval while agents run.
- One ten-second cooldown timeout after the last active turn.
- Idempotent disposal state.

### Refresh Sources

Refresh the controller after:

- Initial registry restoration and checkpoint.
- Every coordinator notification.
- Every root coordinator tool execution, in `finally`, including errors.
- Every delivery reconciliation that changes visible agent state.
- Each live one-second tick while an agent runs.

The coordinator remains the source of truth. Do not maintain a second agent map in the UI controller.

Add an optional tool-definition callback such as `onActivity?: () => void` so root tool execution can refresh the projection. Child tool definitions may omit it because SDK child sessions have no interactive TUI.

### Timer Rules

- Create timers only after `session_start`, never in the extension factory.
- Keep the one-second interval only while at least one agent runs.
- Keep at most one cooldown timeout.
- Call `unref()` when available so presentation timers cannot hold a print-mode process open.
- Clear interval, timeout, widget, and status idempotently on `session_shutdown` before discarding the controller.
- Recreate the controller from coordinator state after resume, fork, reload, or session replacement. Never reuse a captured stale `ExtensionContext`.

### Mode Compatibility

- Build and mount custom widget components only when `context.mode === "tui"`.
- `setStatus`, `setWidget`, and notifications may use Pi's normal degradation in RPC mode, but custom-component construction remains TUI-guarded.
- Print and JSON modes retain the same tool content and details and create no presentation timers.
- Tool and message renderers remain registered because Pi invokes them only where supported.

## Notification Policy

Routine lifecycle changes move to the widget and tool rows. Surface toasts only for events requiring attention:

- Turn failure.
- Interruption.
- Unavailable restoration.
- Fork-clone failure.
- Partial deletion or other destructive-operation failure.

Do not toast successful spawn, completion, message, wait, cancellation, deletion, or restoration.

Map failure and fork-clone failure to `error`; map interruption and unavailability to `warning`. Refresh the UI projection for every notification even when no toast is shown.

Extend `CoordinatorNotification` only if needed to report partial destructive-operation failure. The tool error remains authoritative; a toast is supplementary.

## Source Layout

Keep rendering and session UI below the existing helper directory so Pi sees one extension entrypoint:

```text
dot_pi/agent/extensions/
├── minimal-subagents.ts
└── minimal-subagents/
    ├── minimal-subagents-rendering.ts
    ├── minimal-subagents-rendering.test.ts
    ├── minimal-subagents-ui.ts
    ├── minimal-subagents-ui.test.ts
    └── ... existing implementation and tests
```

Responsibilities:

- `minimal-subagents-rendering.ts`: pure formatting, tool renderer builders, message renderers, usage/duration formatting, and status-symbol mapping.
- `minimal-subagents-ui.ts`: pure hierarchy projection plus the root UI controller and responsive widget component.
- `minimal-subagents-tools.ts`: tool execution and attachment of renderer/callback definitions; no widget state.
- `minimal-subagents-coordinator.ts`: additive task/timing state only; no Pi TUI imports.
- `minimal-subagents.ts`: register message renderers and bind/dispose the root UI controller.

Keep reusable formatting functions independent of the coordinator. Keep Pi TUI imports out of persistence and lifecycle modules.

## Implementation Units

### U1. Add backward-compatible presentation metadata

- Add optional task, latest-activity timestamp, destination, usage, and elapsed fields.
- Capture task at creation and calculate terminal duration before clearing active-turn state.
- Project the fields through summary/detail status, messages, registry replay, checkpoints, and fork clones.
- Prove old snapshots without the fields still replay.

**Done when:** new and old registry fixtures restore, terminal duration is deterministic under an injected clock, and no baseline result field changes meaning.

### U2. Build pure rendering primitives

- Implement symbol, color-role, duration, token, cost, preview, and usage formatters.
- Implement safe detail decoders and fallback text extraction.
- Implement complete hierarchy/detail render models independent of TUI lifecycle.

**Done when:** table-driven tests cover every state, missing fields, malformed details, narrow previews, and zero/nonzero usage.

### U3. Attach six collapsible tool renderers

- Add purpose-specific call/result renderers.
- Add wait partial updates with execution-scoped timer cleanup.
- Use Markdown for expanded successful output and curated sections for normal details.
- Preserve final `content`, `details`, and error semantics.

**Done when:** each tool has collapsed, expanded, partial/error where applicable, and missing-details tests.

### U4. Render coordinator messages

- Add destination and automatic-result metadata at delivery construction.
- Register distinct message and result renderers.
- Preserve durable evidence keys and model-visible message content.

**Done when:** old/new explicit messages and old/new result messages render in collapsed and expanded modes without changing delivery reconciliation.

### U5. Add hierarchy widget and footer controller

- Build deterministic row selection and ancestor inclusion.
- Implement the responsive eight-row component.
- Bind event refresh, one-second running updates, ten-second cooldown, footer visibility, and idempotent disposal.
- Guard custom TUI behavior by mode.

**Done when:** fake-clock tests prove row selection, cooldown replacement, timer cleanup, width bounds, restoration behavior, and hidden idle footer.

### U6. Integrate, review, and smoke-test

- Apply the extension through chezmoi.
- Exercise collapsed/expanded rows with Pi's native expansion mode.
- Spawn parallel and nested agents and observe widget ancestry, live elapsed updates, terminal cooldown, and clean process exit.
- Check RPC/print behavior for unchanged structured content.

**Done when:** automated gates pass and deployed TUI evidence covers the acceptance scenarios below.

## Acceptance Scenarios

### UI-AS1. Collapsed spawn

**Given** Pi tool output is collapsed,
**when** the root spawns a child,
**then** the call shows requested identity/task preview and the result shows canonical identity with `running`, without raw JSON.

### UI-AS2. Expanded successful wait

**Given** a child completes successfully and the parent waits,
**when** tool output is expanded,
**then** the result shows identity, turn, status, persisted duration, complete Markdown output, token breakdown, and nonzero cost when present.

### UI-AS3. Waiting progress

**Given** a wait remains blocked for several seconds,
**when** its partial row renders,
**then** it identifies the target and updates elapsed time about once per second; completion, timeout, and abort leave no interval running.

### UI-AS4. Purpose-specific management rows

**Given** message, status, cancel, and delete results,
**when** collapsed and expanded,
**then** each uses its confirmed summary grammar and its expanded view includes the direct message recipient, affected IDs, tombstones, trash paths, or failures.

### UI-AS5. Error fallback

**Given** a tool error or malformed/missing details,
**when** the renderer runs,
**then** it displays actionable text with failure styling and never throws a rendering error.

### UI-AS6. Distinct conversation messages

**Given** an explicit agent message and an automatic successful result,
**when** they enter the root transcript,
**then** they render as **Agent message** and **Agent result**, show source/destination, provide one-line collapsed previews, and reveal complete content when expanded.

### UI-AS7. Active nested hierarchy

**Given** parallel children and a running grandchild,
**when** the widget renders,
**then** it shows running agents plus required ancestors in depth-first hierarchy order, with live elapsed time and task previews only on meaningful rows.

### UI-AS8. Widget overflow

**Given** more than eight selected agent rows,
**when** the widget renders at narrow and wide terminal widths,
**then** it prioritizes running and attention rows, emits at most eight agent rows plus `… +N more`, and no rendered line exceeds width.

### UI-AS9. Recent outcomes and cooldown

**Given** active agents settle,
**when** no active turn remains,
**then** up to three latest terminal/unavailable outcomes remain for ten seconds, the footer clears immediately, and the widget then clears unless new work replaced the cooldown.

### UI-AS10. Restoration compatibility

**Given** one old registry without UI metadata and one new registry with tasks/durations,
**when** each root restores,
**then** both remain usable; the old hierarchy omits unavailable previews and the new hierarchy retains task/duration ordering data.

### UI-AS11. Attention-only notifications

**Given** routine successful lifecycle activity,
**when** agents spawn, complete, message, wait, cancel, delete, or restore,
**then** no toast appears. Failures, interruptions, unavailability, fork-clone failures, and partial destructive failures produce the configured warning/error toast.

### UI-AS12. Non-TUI stability

**Given** print, JSON, or RPC execution,
**when** coordinator tools run,
**then** model-visible content and structured tool results retain baseline semantics, custom TUI components are not constructed, and no UI timer prevents process exit.

### UI-AS13. Lifecycle cleanup

**Given** running agents, a mounted widget, and active timers,
**when** the session quits, reloads, resumes, switches, or forks,
**then** status/widget state clears, every presentation timer stops, and the replacement session reconstructs UI from its own coordinator.

### UI-AS14. Expansion key integration

**Given** a row with expanded detail,
**when** the user toggles Pi's global tool expansion action,
**then** the native collapsed/expanded renderer changes without an extension keybinding and hints use Pi's resolved key label.

## Verification Contract

| Gate | Command or proof | Done signal |
| --- | --- | --- |
| Focused tests | `cd dot_pi/agent && npx vitest run extensions/minimal-subagents` | Existing coordinator tests and all new rendering/UI tests pass. |
| Type safety | `cd dot_pi/agent && npm run typecheck` | Exit 0 with Pi 0.84.1 renderer and component types. |
| Lint | `cd dot_pi/agent && npm run lint` | Exit 0. |
| Formatting | `cd dot_pi/agent && npm run format:check` | Exit 0. |
| Baseline regression | Run the baseline extension suite | Six-tool behavior, persistence, delivery, fork, and restoration tests remain green. |
| TUI tool smoke | Run spawn, message, wait, status, cancel, and delete in a real Pi TUI; toggle native expansion | Every tool has the specified collapsed and expanded presentation. |
| Widget smoke | Spawn parallel children and a grandchild | Hierarchy, footer, elapsed updates, recent rows, overflow, and cooldown match this specification. |
| Message smoke | Deliver explicit and automatic messages to root | Distinct compact/expanded renderers appear and durable evidence remains exactly once. |
| Process-exit smoke | Run a print-mode spawn/wait under a finite shell timeout | Final output appears and Pi exits itself before the timeout. |
| Width/theme smoke | Resize the TUI and switch themes while the widget is visible | Lines remain within width and semantic styling updates correctly. |

## Definition of Done

- UI-AS1 through UI-AS14 have deterministic automated coverage where Pi permits component construction; real TUI behavior has smoke evidence.
- All six tools use purpose-specific native collapsed/expanded renderers and retain their baseline machine-readable results.
- Explicit agent messages and automatic results use distinct, backward-compatible renderers.
- The above-editor widget shows the confirmed active/ancestor/recent projection, obeys the three-recent and eight-row limits, and clears after the ten-second idle cooldown.
- The footer shows running and retained counts only while work is active.
- New sessions persist exact original tasks, sortable activity timestamps, and terminal durations; old registries restore without migration.
- Routine lifecycle toasts are removed; attention events remain visible.
- Timers and custom UI exist only in eligible session modes, are idempotently disposed, and cannot keep print-mode Pi alive.
- No dashboard, modal, command, custom keybinding, workflow behavior, tool-surface change, or second coordinator state store is introduced.
