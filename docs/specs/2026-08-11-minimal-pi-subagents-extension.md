---
title: Minimal Pi Subagents Extension
artifact_contract: implementation-spec/v1
artifact_readiness: implementation-ready
decision_status: confirmed
date: 2026-08-11
topic: minimal-pi-subagents
execution: code
---
<!-- markdownlint-disable MD013 MD025 -->

# Minimal Pi Subagents Extension

## Purpose

Replace the configured `pi-subagents` package with a local Pi extension that provides persistent, parallel, nested subagents without a workflow language or policy framework.

This specification is the product and implementation authority for the replacement. The decisions were confirmed in the design session on 2026-08-11.

## Goals

- Launch persistent subagents with explicit control over inherited conversation context, project context, model, thinking level, and ordinary tools.
- Allow unlimited parallelism with explicit, depth-bounded nested fanout.
- Support direct parent-to-child, child-to-parent, and same-root agent messaging.
- Let agents inspect and wait for peers while root and authorized fanout parents manage child lifecycles.
- Persist every child as a normal Pi session and restore the hierarchy when the owning root session resumes.
- Automatically deliver each successful child turn to its direct parent without steering the parent's active turn.
- Keep the extension small: one coordinator, six tools, normal Pi sessions, and native Pi session/model/tool primitives.

## Non-goals

- Workflow scripts, DAGs, chains, fan-out languages, retries, gates, acceptance policies, budgets, profiles, roles, missions, schedules, watchdogs, worktrees, or approval checkpoints.
- A fleet dashboard, inspector, transcript browser, or persistent status widget.
- Cross-process or cross-machine messaging, IRC, RPC, or a background daemon.
- Continuing provider work while Pi is not running.
- Concurrency limits, queues, mutation coordination, or automatic fanout authorization.
- A command sandbox or a claim that tool classes are security boundaries.
- Session ownership leases in v1.
- Automatic cleanup or retention policies.
- Automatic model fallback, turn restart, or orchestration-level retry.
- Making child sessions concurrent branches of the interactive root's JSONL tree. Pi has no supported extension API for that topology.

## Terminology

- **Root:** The interactive Pi session that owns a coordinator. Its canonical agent ID is `root`.
- **Agent:** A persistent child conversation backed by its own Pi session file.
- **Turn:** One prompt and the resulting assistant/tool loop until completion, failure, cancellation, or interruption.
- **Caller:** The root or child whose tool call invoked an operation.
- **Direct parent:** The agent that spawned a child.
- **Coordinator tools:** The six tools in this specification. Every child receives message, wait, and status independently of ordinary tool selection. Spawn, cancel, and delete are available only to the root and explicitly authorized fanout children below the depth cap; child cancel/delete authority is limited to strict descendants.
- **Ordinary tools:** Built-in or extension-provided tools selected by the launch contract.
- **Launch contract:** The immutable context, model, thinking, project-context, and ordinary-tool configuration captured when an agent is created.
- **Conversation-plane message:** Content added to the recipient's model context.
- **Control-plane notification:** UI/status information that does not become model input.

## Public Tool Surface

The extension registers exactly these six LLM-callable tools. `EnabledModel` is a runtime-generated JSON Schema enum described in [Model Selection](#model-selection).

```ts
type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type EnabledModel = `${string}/${string}`;

type ToolSelection = "none" | "read" | "modify" | string[];

subagent({
  task: string,
  agent_id?: string,
  session_context?: "inherit" | "compact" | "omit",
  project_context?: "inherit" | "omit",
  model?: EnabledModel,
  thinking_level?: ThinkingLevel,
  tools?: ToolSelection,
  delegation?: "none" | "fanout",
});

subagent_message({
  agent_id?: string,
  message: string,
  behavior?: "steer" | "follow-up",
});

subagent_wait({
  agent_id: string,
  timeout_ms?: number,
});

subagent_status({
  agent_id?: string,
});

subagent_cancel({
  agent_id: string,
  recursive?: boolean,
});

subagent_delete({
  agent_id: string,
  recursive?: boolean,
});
```

There is no separate `subagent_list` tool. Calling `subagent_status` without an ID lists the hierarchy.

## Common Result Contracts

```ts
interface SpawnResult {
  agent_id: string;
  turn_id: string;
  status: "running";
}

interface TurnResult {
  agent_id: string;
  turn_id: string;
  status: "completed" | "failed" | "cancelled" | "interrupted";
  output: string;
  error?: string;
  elapsed_ms?: number;
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
  };
}

interface DeliveryResult {
  agent_id: string;
  delivered: boolean;
  error?: string;
}

interface MessageResult {
  behavior: "steer" | "follow-up";
  deliveries: DeliveryResult[];
}

interface AgentSummary {
  agent_id: string;
  parent_id: string;
  state: "running" | "idle";
  availability: "available" | "unavailable";
  active_turn_id?: string;
  latest_turn?: Pick<TurnResult, "turn_id" | "status">;
  model: string;
  thinking_level: ThinkingLevel;
  tools: string[];
  elapsed_ms?: number;
  latest_activity?: string;
  latest_activity_at?: string;
  task?: string;
  child_count: number;
  children: AgentSummary[];
}

interface AgentDetail extends AgentSummary {
  session_file?: string;
  launch_contract: Record<string, unknown>;
  capability_ceiling: string[];
  spawn_entry_id: string;
  recent_messages: Array<{
    source_agent_id: string;
    turn_id: string;
    content: string;
  }>;
  latest_result?: TurnResult;
  missing_dependencies: string[];
  unavailable_reason?: string;
  usage?: TurnResult["usage"];
  descendant_usage?: TurnResult["usage"];
}

type StatusResult =
  | { root_id: "root"; agents: AgentSummary[] }
  | { agent: AgentDetail };

interface CancelResult {
  agent_id: string;
  recursive: boolean;
  affected_agent_ids: string[];
  cancelled_turn_ids: string[];
}

interface DeleteResult {
  agent_id: string;
  recursive: boolean;
  deleted_agent_ids: string[];
  tombstoned_agent_ids: string[];
  trashed_session_files: string[];
  failures: Array<{ agent_id: string; error: string }>;
}
```

`subagent_message` always returns `MessageResult`; a direct send has one delivery and a broadcast has one delivery per snapshotted recipient. A failed direct send is a tool error carrying that result. A broadcast is successful when at least one delivery succeeds and becomes a tool error only when every delivery fails. `subagent_status` returns `StatusResult`. Cancel returns `CancelResult`, including empty arrays for an idle no-op. Delete returns `DeleteResult`; if a post-order filesystem deletion partially fails, the tool result is an error carrying the partial result, completed deletions stay tombstoned, and unprocessed agents remain live. There is no rollback across filesystem operations.

Tool errors use Pi's ordinary error result mechanism and include a concise actionable explanation. They never silently clamp tool access, substitute a model, overwrite an agent, or share a source session after a clone failure.

## Identity and Addressing

### Canonical IDs

- The interactive root is `root`.
- `agent_id` on `subagent` is one friendly path segment matching `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`.
- Friendly IDs are case-sensitive and unique among peers.
- The exact segments `root` and `parent` are reserved. Empty, whitespace, dotted, slash-containing, and path-like values fail validation; `*` is an address alias only.
- A child canonical ID is `<parent canonical ID>.<friendly ID>`.
- Examples: `root.research`, `root.research.sources`, `root.review`.
- Generated friendly IDs must be unique among peers and remain stable for the session's lifetime.
- Deleted IDs become durable tombstones and cannot be reused until the owning root session is deleted.
- Duplicate IDs fail; they never overwrite or resume an existing agent.

### Address Resolution

- Management and direct-message operations accept canonical IDs returned by `subagent`.
- `subagent_message` additionally accepts `parent` and `*`.
- Omitted `subagent_message.agent_id` means `parent` for a child caller.
- Omitting the target at `root` is an error.
- `*` broadcasts to a snapshot of every existing agent except the sender.
- Any agent may message any other agent under the same root.
- Cross-root addresses are unsupported.
- Root cancel and delete may target any non-root agent in the same hierarchy.
- An authorized fanout child may cancel or delete only strict descendants of its own canonical ID. It may not manage itself, siblings, ancestors, or unrelated branches.
- Ordinary children and depth-capped children do not receive cancel or delete tools.
- The coordinator repeats these caller checks even when a stale or manually constructed tool definition reaches it. The root cannot be cancelled or deleted through these tools.

## Agent and Turn State

Agent runtime state is intentionally small:

```ts
type AgentState = "running" | "idle";
type AgentAvailability = "available" | "unavailable";
type TurnStatus = "running" | "completed" | "failed" | "cancelled" | "interrupted";
```

- `running` covers context preparation, spawn-time compaction, prompting, model streaming, and tool execution.
- An agent becomes `idle` after its active turn settles.
- `unavailable` is orthogonal to runtime state. It means a persisted launch dependency, such as a model or named tool, cannot currently be resolved.
- A failed, cancelled, or interrupted turn does not destroy the agent.
- Messages sent to an idle available agent start another turn in the same persistent conversation.
- Launch contracts are immutable. A different model, thinking level, project-context mode, or tool contract requires a new agent.

## `subagent` Contract

### Defaults

| Field | Default |
| --- | --- |
| `agent_id` | Generated peer-unique friendly segment |
| `session_context` | `inherit` |
| `project_context` | `inherit` |
| `model` | Caller's effective model, snapshotted at spawn |
| `thinking_level` | Caller's effective thinking level, snapshotted at spawn |
| `tools` | Caller's effective delegable ordinary tools |
| `delegation` | `none` |

There is no working-directory parameter. Every descendant uses the root session's project directory.

### Execution Semantics

- Spawn is always asynchronous.
- The tool validates the launch contract, allocates the canonical ID and turn ID, creates the persisted session identity, schedules the first turn, and returns `SpawnResult` without waiting for model completion.
- Expensive setup, including `session_context: "compact"`, runs inside the new turn after spawn returns.
- There is no foreground/background option. Foreground composition is `subagent` followed by `subagent_wait`.
- Pi may execute several `subagent` tool calls concurrently.
- The coordinator imposes no concurrency limit and creates no queue.
- The root may always spawn. A child may spawn only when its immutable launch contract has `delegation: "fanout"` and its depth is below 2.
- Depth uses root = 0, child = 1, and grandchild = 2. A grandchild never receives `subagent`; direct coordinator invocation at the cap fails explicitly.
- Ordinary children receive an explicit boundary to complete their task directly. Fanout children receive a boundary limiting delegation to the fanout assigned by their parent and requiring them to own synthesis.
- Tool registration and `coordinator.spawn()` both enforce authorization so stale runtime definitions cannot bypass the contract.
- A setup failure settles the first turn as failed and leaves the agent idle and reusable when its persisted session remains valid.

## Context Assembly

### Session Context

Context is copied from the immediate caller, not always from the interactive root.

- `inherit` copies a spawn-time snapshot of the caller's committed conversation messages.
- The snapshot ends before the currently streaming assistant turn that invoked `subagent`.
- Partial assistant reasoning, the spawn tool call, and its eventual result are excluded.
- The child task is appended as a new user prompt after imported context.
- Parent system prompts are not copied.
- The snapshot is not a live link; later parent messages do not appear unless explicitly sent.
- Images and supported Pi message content are preserved when the selected child model supports them.
- If the source snapshot selected by `inherit` or `compact` contains images and the selected child model lacks image input, spawn validation fails before creating the agent. Images are never silently dropped, summarized away, or converted.

For `compact`:

1. Snapshot the same committed caller context used by `inherit`.
2. Use Pi's built-in compaction preparation and summarization mechanism with the caller's effective model.
3. Do not mutate or append a compaction entry to the caller.
4. Initialize the child with Pi's canonical compacted representation: summary plus retained recent tail.
5. Store compaction usage with the child turn/session so status can report it.

For `omit`, import no caller conversation. The task remains the first child user prompt.

### Project Context

- `inherit` loads applicable AGENTS files, skills, and prompt resources from the root project directory using Pi's normal project resource discovery.
- `omit` excludes those instruction, skill, and prompt resources.
- Extension loading is separate from project context because extensions may provide requested tools.
- Every child receives Pi's normal system prompt for its effective ordinary tools and project resources.
- Append one small fixed system-prompt block containing the canonical agent ID, direct-parent ID, available coordinator tools, addressing aliases, completion behavior, and the instruction that it is a persistent subagent.

After initialization, each child uses Pi's ordinary automatic compaction behavior and effective compaction settings.

## Model Selection

`model` and `thinking_level` remain independent fields.

### Runtime Enum

Build the `model` enum on root session start, resume, and reload:

1. Read the effective Pi settings and model registry; do not parse only the global settings file because project settings may override it.
2. If `enabledModels` exists, resolve its patterns through Pi's model resolution rules.
3. Strip a recognized trailing thinking suffix such as `:xhigh` before constructing model values.
4. Include only authenticated and available matches.
5. Emit canonical `provider/model` strings, deduplicated in stable order.
6. If `enabledModels` is absent, include every authenticated and available model.
7. If no model is eligible, make explicit `model` selection impossible while preserving omission/inheritance.

Wildcards are never accepted as tool arguments. The dynamic enum refreshes only at start, resume, or reload; it does not watch files continuously.

### Effective Selection

- Omitted `model` snapshots the caller's effective model even when that model is not currently an explicit enum choice.
- Omitted `thinking_level` snapshots the caller's effective level.
- Explicit thinking is clamped through Pi's native model-capability rules.
- The spawn and status results report the effective thinking level.
- Existing agents do not follow later parent model or thinking changes.
- A persisted agent whose model is removed from `enabledModels`, loses authentication, or disappears from the registry restores as unavailable.
- The coordinator never selects a fallback model.
- Child settings disable Pi's agent-level retry and set provider retry attempts to zero. A failed request settles the turn; only a later explicit message starts new work.

## Ordinary Tool Selection

Coordinator tools are injected separately from ordinary tools, including when `tools` is `none`. Every child receives `subagent_message`, `subagent_wait`, and `subagent_status`. Root and authorized fanout children below the depth cap additionally receive `subagent`, `subagent_cancel`, and `subagent_delete`. Cancel and delete remain caller-authorized inside the coordinator.

| Selection | Ordinary tools |
| --- | --- |
| Omitted | Caller's effective delegable ordinary tools |
| `none` | None |
| `read` | `read`, `grep`, `find`, `ls` |
| `modify` | `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write` |
| `string[]` | Exact named tools |

Rules:

- Tool classes are convenience bundles, not security claims. In particular, `bash` can mutate files.
- Resolve requested tools before starting the child. Missing or unloadable names fail explicitly.
- Discoverable configured extensions may be loaded to provide named custom tools even when project context is omitted.
- Runtime-only or inline custom tools whose executable definitions cannot be loaded into the child are unsupported.
- Omitted inheritance captures the caller's current ordinary tool set at spawn.
- Every agent has a transitive delegable capability ceiling. A descendant's resolved ordinary tools must be a subset of its caller's ceiling.
- A tool request that exceeds the ceiling fails rather than silently intersecting the requested set.
- Coordinator tools do not count toward the ordinary-tool ceiling.

## Runtime Architecture

### One Coordinator

- One process-local coordinator is owned by the interactive root extension instance.
- The coordinator maintains the live agent map, parent/child index, per-recipient message queues, active waiters, session subscriptions, registry writer, and delivery reconciliation state.
- SDK-created child sessions do not recursively load this extension as an independent coordinator.
- Instead, inject caller-bound coordinator tool definitions through `customTools` when each child `AgentSession` is created.
- Exclude the extension entrypoint from the child's resource loader while allowing other discoverable extensions needed for ordinary tools.
- Each injected tool closure identifies its caller by canonical ID. It includes spawn, cancel, and delete only when the persisted caller contract authorizes fanout below the depth cap; cancel and delete pass the caller ID to the coordinator for strict-descendant authorization.
- The root tool definitions use the same coordinator through a root-session adapter.

### Native Pi Primitives

Use in-process `AgentSession`s and their native methods:

- `prompt()` for the initial task and ordinary idle prompts.
- `sendCustomMessage()` with `triggerTurn` and `deliverAs` for visible child-directed coordinator messages.
- `steer()` and `followUp()` only where an ordinary text prompt, rather than a typed custom message, is intended.
- `subscribe()` for turn, assistant, tool, usage, retry, compaction, and lifecycle observations.
- `abort()` to cancel active turns.
- `dispose()` during delete, shutdown, reload, or session replacement.

Use `pi.sendMessage()` with the same custom type/details and delivery options for root-directed conversation-plane messages. The coordinator must not append a custom context entry separately from these APIs, because `sendCustomMessage()` and `pi.sendMessage()` already persist the message. No external transport is part of v1.

## Persistent Sessions and Registry

### Child Sessions

- Every successfully created child uses a writable, persisted `SessionManager` and normal Pi JSONL session file.
- A fork-clone failure is the sole exception: it creates a registry-only unavailable placeholder with no session file so the fork never references the source file.
- Child sessions use the root project directory and effective session-directory settings.
- Name sessions `[subagent] <canonical agent ID>` so they are recognizable in `/resume`.
- Append a non-context child identity entry containing schema version, original root session ID, canonical ID, direct-parent ID, and creation time.
- Persist normal model, thinking, messages, compactions, tool results, and usage through Pi's session mechanisms.

### Root Registry

The root session is the hierarchy's source of truth. Store versioned, append-only, non-context custom entries; do not create a separate database or global manifest.

Use one custom entry type, such as `minimal-subagents.registry`, with this event family:

```ts
type RegistryEventV1 =
  | RegistryCheckpointV1
  | AgentCreatedV1
  | TurnStartedV1
  | TurnSettledV1
  | DeliveryPendingV1
  | DeliverySettledV1
  | AgentDeletedV1;

interface RegistryEventBaseV1 {
  version: 1;
  root_session_id: string;
  timestamp: string;
}
```

Required information across these events:

- Canonical and friendly IDs, parent ID, creation time, and original spawn entry ID.
- Optional child session file and session ID. They are absent only for fork-clone-failed placeholders, which instead carry a clone error.
- Immutable launch contract and resolved effective model, thinking level, ordinary tools, delegation mode, and capability ceiling.
- Exact original task, sortable latest-activity timestamp, and terminal turn duration.
- Active/latest turn ID and terminal state.
- Availability failures and missing dependency names.
- Delivery source turn, destination parent, chosen delivery path, and settlement receipt.
- Deletion tombstones.
- A complete checkpoint after initial root ownership and after root forks.

Registry replay scans custom entries for the current root session ID in file append order, beginning with its latest checkpoint. This makes the hierarchy root-session-wide rather than dependent on the currently selected conversation branch.

## Messaging

### Explicit Messages

`subagent_message` sends one conversation-plane message and returns immediately after coordinator acceptance.

- `behavior` defaults to `steer`.
- For a running recipient, `steer` routes through steering and `follow-up` routes through the follow-up queue.
- For an idle recipient, either behavior starts a new prompt immediately.
- Serialize all deliveries per recipient in coordinator-receipt order.
- Make no ordering guarantee across recipients.
- Broadcast snapshots recipients at invocation time and returns one `DeliveryResult` per target.
- A failure for one broadcast recipient does not roll back successful deliveries.
- Render explicit messages with custom type `minimal-subagents.message`, visible content, and details containing source agent ID and source turn ID. Deliver them through `sendCustomMessage()` for children or `pi.sendMessage()` for the root, with `triggerTurn: true` when idle and the requested `deliverAs` mode when running. They participate in recipient context without masquerading as human-authored input.

An agent requesting help sends its parent a message and finishes its own turn. Messaging has no blocking request/response protocol.

### Automatic Final-Response Delivery

After every successful terminal assistant response:

1. Persist the assistant response in the source child session.
2. Record a delivery-pending registry event keyed by source agent ID and turn ID.
3. Select the direct parent as the destination.
4. If that direct parent has an active waiter for the exact source turn, resolve the wait with `TurnResult` and do not enqueue a second copy. The returned tool result `details` must include the source agent ID and source turn ID as its idempotency key.
5. Keep the delivery pending after resolving the Promise. A subscription or later session scan settles delivery only after Pi appends that keyed wait tool result to the parent session.
6. Otherwise, deliver a visible custom message of type `minimal-subagents.result` with source agent ID, source turn ID, and status in `details`, and the final response as content.
7. If the parent is running, deliver as follow-up; if idle, start a new parent turn immediately.
8. Record delivery settlement only after the destination session contains durable keyed evidence of delivery.

Completion never steers an active parent turn.

Failures, cancellation, interruption, progress, and lifecycle changes remain control-plane notifications. They are visible to the user and status tools but are not automatically inserted as conversational prompts.

### Exactly-Once Recovery

A process may die after writing the source result but before writing a delivery receipt. On restoration:

- Compare settled source turns with delivery events.
- Inspect the destination session for a wait tool result `details` object or custom result message carrying the same source agent ID and turn ID.
- Treat matching destination evidence as delivered even if the final receipt was not written.
- Replay only completed, undelivered successful results.
- Never replay failed, cancelled, or interrupted turns as successful output.

## Waiting

`subagent_wait` observes one exact turn:

- If the target is running, capture its active turn ID when the wait begins.
- If the target is idle, return its latest turn immediately.
- If no turn exists, return a tool error.
- The wait returns when the captured turn settles, even if a later turn starts.
- Omitted `timeout_ms` waits indefinitely.
- Timeout and caller cancellation stop only the wait; they never cancel the target.
- Multiple waits may exist. Only a wait owned by the successful turn's direct parent suppresses automatic parent delivery.
- Parallel waiting uses multiple concurrent `subagent_wait` calls; there is no `waitAll`, race, quorum, or aggregation API.

## Status and Monitoring

Calling `subagent_status` without an ID returns a concise rooted hierarchy. Calling it with an ID returns detail for that agent.

Summary fields:

- Canonical ID and direct parent.
- Runtime state and availability.
- Active/latest turn ID and status.
- Effective model and thinking level.
- Ordinary tool names.
- Elapsed time and latest activity description.
- Child count.

Detailed fields additionally include:

- Persisted session file when one exists; fork-clone-failed placeholders omit it.
- Immutable launch contract and capability ceiling.
- Original root spawn entry ID.
- Recent explicit messages.
- Latest final response or error.
- Missing dependencies.
- Per-session usage and aggregated descendant usage on demand.

Status does not expose raw model thinking or a full event transcript. Normal child sessions remain directly inspectable through `/resume`.

The human-facing UI is limited to small native notifications for spawn, completion, failure, cancellation, interruption, restoration, unavailability, and fork-clone failure. There is no fleet widget.

## Cancellation and Deletion

### Cancellation

- `recursive` defaults to `true`.
- Cancel aborts active target turns and, when recursive, active descendant turns.
- Cancel preserves all sessions and launch contracts.
- Settled cancelled turns leave their agents idle.
- Non-recursive cancellation leaves descendants running.
- Cancelling an idle target is a successful no-op with current status.

### Deletion

- `recursive` defaults to `true`.
- Delete aborts active work, disposes sessions, removes the agents from the live coordinator, and trashes their persisted session files.
- Recursive delete processes descendants before their parent.
- Non-recursive delete fails while descendants exist; it never reparents or orphans them.
- Registry tombstones remain after session files are removed.
- Already-delivered messages in ancestor sessions remain historical context.
- There is no automatic cleanup of idle agents.

## Shutdown, Crash, and Restoration

### Graceful Shutdown

On quit, reload, new session, resume, switch, or fork:

1. Stop accepting new operations for the closing coordinator.
2. Abort active child turns.
3. Persist those turns as cancelled.
4. Unsubscribe listeners and dispose child runtimes.
5. Preserve child session files and registry entries.
6. Make cleanup idempotent because Pi may replace session-bound contexts.

### Crash Recovery

When the owning root session resumes:

- Replay its registry and reopen every non-deleted descendant session.
- A turn with a durable start and no terminal event becomes interrupted.
- Restore interrupted agents as idle; never restart their task automatically.
- Reconcile successful undelivered results exactly once.
- Recreate live subscriptions and injected coordinator tools.
- Preserve canonical IDs, tombstones, launch contracts, and lineage.
- Resolve model and tool dependencies again. Missing dependencies make an agent unavailable instead of changing its contract.

The extension adds no fallback or orchestration-level retry. Provider behavior already internal to Pi is not reimplemented by the coordinator.

## Pi Session Navigation

### Root `/tree`

- The subagent hierarchy belongs to the root session file, not one conversation branch.
- Agents keep running when the root navigates its entry tree.
- The registry replays events across the session file rather than only the active branch.
- Store the root entry ID from which each agent was spawned for status and diagnostics.
- Subsequent messages and automatic results enter whichever root branch is active when delivery occurs.

### Root Fork

A fork must never make two roots write the same child session file.

1. Before Pi replaces the root runtime, snapshot the old live coordinator registry and retain `previousSessionFile` as recovery evidence. Do not infer the hierarchy only from custom entries copied onto the fork's selected root branch.
2. Abort and settle active child turns as cancelled to obtain stable leaves.
3. Clone every non-deleted child session through its writable `SessionManager`, using Pi's branched-session creation at the current child leaf.
4. Clone the complete hierarchy, immutable launch contracts, canonical IDs, tombstones, and delivery receipts.
5. Write a new root-specific registry checkpoint whose session paths and IDs point only to clones.
6. Restore cloned agents as idle under the forked root.
7. Leave the original root and original child sessions independently resumable.

If a child clone fails:

- The fork must not reference the source child session.
- Create registry-only placeholders for that child and its descendants with `availability: "unavailable"`, `state: "idle"`, no session path, and the clone error.
- Placeholder registry replay, status, and recursive deletion remain available. Message, wait, cancel, live `AgentSession` restoration, and direct resume fail with the recorded clone error because no child session exists.
- Keep successfully cloned peers usable.
- Persist placeholders across fork-root restoration and notify the user of every failed subtree.

### Direct Child Resume

When a child session is opened directly through `/resume`:

- Promote the opened session to an independent interactive root for that process.
- Retain original lineage only as historical identity metadata.
- Do not recover its former descendants; they remain owned by the original root registry.
- Do not attempt cross-process messaging to its former parent.
- Concurrently opening a child while its original root owns it is unsupported in v1 and must be documented in notifications/status.

## Bounded Delegation Policy

The coordinator deliberately implements:

- No maximum live-agent count or concurrency semaphore.
- No queue for provider capacity.
- `delegation: "none"` by default; explicit `fanout` authorization is immutable per agent.
- A fixed maximum depth of 2: root → child → grandchild.
- No cross-agent file mutation lock.
- No cycle or deadlock prevention for messaging and indefinite waits.

Provider limits and operating-system failures surface as ordinary turn or tool failures. Width remains unlimited after deliberate fanout authorization; the depth cap prevents recursive delegation cascades.

## Source Layout

Implement the extension in the chezmoi source tree:

```text
dot_pi/agent/extensions/
├── minimal-subagents.ts
└── minimal-subagents/
    ├── minimal-subagents-capabilities.ts
    ├── minimal-subagents-context.ts
    ├── minimal-subagents-coordinator.ts
    ├── minimal-subagents-fork-lifecycle.ts
    ├── minimal-subagents-registry.ts
    ├── minimal-subagents-sessions.ts
    ├── minimal-subagents-tool-schemas.ts
    ├── minimal-subagents-tools.ts
    ├── minimal-subagents-types.ts
    ├── minimal-subagents-usage.ts
    └── minimal-subagents-*.test.ts
```

- `minimal-subagents.ts` is the only extension entrypoint.
- Helpers and tests live below the sibling directory so Pi does not treat them as independent extension entrypoints.
- Keep the coordinator independent from rendering and TypeBox schemas so lifecycle and recovery tests can use in-memory fakes.
- Keep registry replay and context transformation pure where possible.

## Migration from `pi-subagents`

The old and new plugins register overlapping tool names and must not be active together.

Implementation sequence:

1. Build and test the local extension while the old package remains configured, using direct unit/integration construction rather than loading both into one live Pi runtime.
2. Verify registry, nested coordinator tools, context modes, messaging, restoration, and fork cloning in focused tests.
3. Remove `npm:pi-subagents` from `dot_pi/agent/settings.json`.
4. Remove the obsolete `subagents` configuration block from that file.
5. Apply the local extension and settings through chezmoi.
6. Start a fresh Pi root session and verify that exactly the six specified tools are registered by the replacement.
7. Preserve the old package only in source-control history; do not maintain a compatibility adapter or import its runtime state.

Existing `pi-subagents` runs, missions, artifacts, schedules, and agent profiles are not migrated.

## Implementation Units

### U1. Contracts, schemas, and model/tool resolution

- Define public TypeBox schemas and structured results.
- Build the dynamic model enum from effective `enabledModels` and authenticated registry models.
- Resolve fixed tool bundles, explicit names, inheritance, and transitive ceilings.
- Test empty model sets, pattern resolution, thinking suffix stripping, custom tools, missing dependencies, and ceiling violations.

### U2. Registry and persistent session creation

- Implement versioned root registry events, checkpoint replay, child identity entries, tombstones, and immutable launch contracts.
- Create normal persisted child sessions and stable hierarchical IDs.
- Test replay across root tree branches, duplicate IDs, deletion, and unavailable restoration.

### U3. Context preparation and child runtime

- Implement committed-context snapshots for root and nested callers.
- Implement inherit, omit, and non-mutating built-in compact preparation.
- Build child resource loaders and system prompts.
- Create child `AgentSession`s with injected caller-bound coordinator tools and without recursively loading the extension.

### U4. Messaging, completion, wait, and status

- Implement per-recipient queues, steering/follow-up behavior, aliases, broadcast snapshots, and partial delivery results.
- Subscribe to child lifecycle events and implement automatic direct-parent final delivery.
- Implement exact-turn waits and duplicate suppression.
- Implement tree and detailed status plus native notifications.

### U5. Lifecycle, recovery, and fork cloning

- Implement cancel, delete, idempotent shutdown, crash interruption, dependency revalidation, and exactly-once delivery reconciliation.
- Implement direct child promotion.
- Implement complete hierarchy cloning on root fork with no source-session fallback.

### U6. Migration and deployed smoke verification

- Remove the old package and settings only after focused tests pass.
- Apply the new local extension through chezmoi.
- Verify fresh-root, nested, background, restart, direct-resume, and fork behavior against this specification.

## Acceptance Scenarios

### AS1. Default inherited background spawn

**Given** the root has committed conversation history, project resources, an active model/thinking selection, and ordinary tools,
**when** it spawns an agent with only `task`,
**then** spawn immediately returns `root.<generated>` and a running turn, while the child receives the committed history, project context, inherited model/thinking, and inherited ordinary tools.

### AS2. Parallel nested agents

**Given** two root children explicitly authorized with `delegation: "fanout"`,
**when** each creates descendants concurrently,
**then** all turns run without a coordinator queue, IDs remain unique within their peer sets, and the depth-2 descendants cannot delegate again.

### AS3. Context modes

**Given** a parent with long history,
**when** it creates inherit, compact, and omit children,
**then** the children respectively receive the committed snapshot, built-in summary plus retained tail, and no parent messages; none receives the current partial assistant turn.

### AS4. Model enumeration

**Given** configured `enabledModels` patterns,
**when** the tool schema is built,
**then** `model` enumerates only authenticated resolved canonical IDs with thinking suffixes removed. If `enabledModels` is absent, it enumerates all authenticated available models.

### AS5. Independent thinking selection

**Given** an explicit model and thinking level,
**when** the model supports a different level set,
**then** Pi clamps thinking natively and spawn/status report the effective level without changing the selected model.

### AS6. Capability ceiling

**Given** a read-only child,
**when** it requests a modifying descendant,
**then** spawn fails explicitly. It may create a read-only or tool-less descendant and retains only the coordinator tools authorized for its caller identity.

### AS7. Explicit update and help request

**Given** a child is running and its parent is idle,
**when** the child sends an omitted-target message,
**then** the message targets its direct parent, starts a parent turn, and is rendered as a subagent message rather than human input.

### AS8. Successful background completion

**Given** a parent is not waiting for a child,
**when** the child completes successfully,
**then** its final response is delivered exactly once to the parent as follow-up when running or as a new prompt when idle.

### AS9. Wait deduplication

**Given** the direct parent is waiting for the child's active turn,
**when** that turn completes,
**then** the wait returns the structured result and no duplicate completion message is queued.

### AS10. Wait timeout

**Given** a running child and a finite `timeout_ms`,
**when** the deadline expires,
**then** only the wait ends; the child keeps running.

### AS11. Broadcast partial failure

**Given** several agents, including an unavailable recipient,
**when** an agent broadcasts,
**then** recipients are snapshotted, available recipients receive the message in coordinator order, and the result reports the unavailable recipient without rolling back successful deliveries.

### AS12. Cancellation and reuse

**Given** a running parent with descendants,
**when** it is recursively cancelled,
**then** active turns settle as cancelled, all sessions remain, and later messages can start new turns.

### AS13. Recursive deletion

**Given** a child hierarchy,
**when** its root child is deleted recursively,
**then** descendant sessions are trashed before the parent, registry tombstones remain, and the canonical IDs cannot be reused.

### AS14. Crash restoration

**Given** Pi dies while children are running and one earlier result may be pending delivery,
**when** the original root resumes,
**then** unfinished turns become interrupted and idle, successful undelivered output is reconciled exactly once, and no task restarts automatically.

### AS15. Dependency drift

**Given** a persisted child whose model or named tool is no longer enabled or available,
**when** the root resumes,
**then** the child history and metadata restore as unavailable without fallback or silent tool removal.

### AS16. Root tree navigation

**Given** live children spawned from one root entry,
**when** the root navigates to another branch,
**then** children remain live and their later results enter the newly active branch while status retains their original spawn entry IDs.

### AS17. Root fork

**Given** a root with a nested child hierarchy,
**when** the root forks,
**then** active child turns are cancelled, every child session is cloned to a distinct file, both roots can later resume independently, and neither registry references the other's child files.

### AS18. Partial fork failure

**Given** one child session cannot be cloned,
**when** the root forks,
**then** the fork marks that subtree unavailable, reports the error, keeps successful clones usable, and never shares the source session file.

### AS19. Direct child resume

**Given** an idle persisted child,
**when** the user opens it directly through `/resume`,
**then** it becomes an independent root without former descendants or live messaging to its former parent.

### AS20. Bounded explicit fanout

**Given** an ordinary child, an authorized depth-1 fanout child, and a depth-2 grandchild,
**when** each attempts to spawn,
**then** the ordinary child is denied, the authorized depth-1 child may spawn without a concurrency queue, and the depth-2 child is blocked by the fixed cap.

### AS21. No automatic retry or fallback

**Given** a child provider request fails or its selected model becomes unavailable,
**when** the failure settles,
**then** the turn fails after one Pi agent-level attempt, no fallback model is selected, and no replacement turn starts until an agent explicitly messages it.

### AS22. Caller-scoped lifecycle management

**Given** an ordinary child, an authorized fanout child with a descendant, and a sibling branch,
**when** they inspect their coordinator tools and attempt cancellation or deletion,
**then** the ordinary child has no cancel/delete tools, the fanout child may manage its strict descendant, neither child can manage itself, a sibling, or an ancestor, and root retains hierarchy-wide authority.

## Verification Contract

| Gate | Command or proof | Done signal |
| --- | --- | --- |
| Focused tests | `cd dot_pi/agent && npx vitest run extensions/minimal-subagents` | All coordinator, context, model, tool, registry, messaging, recovery, and fork scenarios pass. |
| Type safety | `cd dot_pi/agent && npm run typecheck` | Exit 0 with no diagnostics. |
| Formatting | `cd dot_pi/agent && npm run format:check` | Exit 0 for extension and tests. |
| Lint | `cd dot_pi/agent && npm run lint` | Exit 0 for extension and tests. |
| Migration diff | Inspect `dot_pi/agent/settings.json` and deployed chezmoi diff | Old `pi-subagents` package/config is removed and the local entrypoint is the only replacement. |
| Fresh root smoke | Start a new Pi session after targeted chezmoi apply | Exactly six replacement tools are available; one inherited child completes and returns automatically. |
| Parallel/nested smoke | Spawn parallel children and at least one grandchild | Canonical IDs, status tree, messaging, and completion work without a coordinator queue. |
| Persistence smoke | Exit during/after child work, then resume the owning root | Sessions restore, interrupted work is not retried, and successful output is not duplicated. |
| Fork smoke | Fork a root with idle and formerly active descendants | All child session paths differ between roots and both roots resume independently. |

## Definition of Done

- The public surface contains exactly the six specified tools and their confirmed defaults.
- AS1-AS22 have focused automated coverage where Pi APIs permit deterministic construction; persistence, direct resume, and fork also have deployed smoke evidence.
- Every child uses a normal persisted Pi session and is visible through `/resume`.
- The original root restores its complete hierarchy after restart without restarting interrupted work.
- Successful final responses reach direct parents exactly once and never steer active parent turns.
- Unlimited parallel width works without a plugin semaphore or queue; nested spawning requires explicit fanout authorization and stops at depth 2.
- Context, model, thinking, project-resource, ordinary-tool, and capability-ceiling behavior matches this specification.
- Root tree navigation, root fork cloning, direct child promotion, cancellation, deletion, tombstones, and unavailable dependency restoration match this specification.
- The old `pi-subagents` package and its settings block are removed from the deployed Pi configuration.
- No workflow DSL, role/profile system, mission system, fleet UI, external transport, ownership lease, automatic cleanup, fallback, or orchestration retry is introduced.
