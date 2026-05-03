---
children_hash: 6afd09963984274c1b7f3eeaf71858d230e65ecb1d506acb254b81d01b88221b
compression_ratio: 0.9559164733178654
condensation_order: 3
covers: [architecture/_index.md]
covers_token_total: 1293
summary_level: d3
token_count: 1236
type: summary
---
# architecture

## ByteRover / OpenCode context engine and plugin behavior

This cluster captures a memory architecture that **curates durable signal from chat** and **recalls it safely at runtime**. The design is split between:

- **Curation/persistence**: save only lasting-value content from completed turns
- **Recall/injection**: restore a bounded, cleaned recent context into the system prompt

## Core architectural principles

- **Selective memory**: keep facts, decisions, technical details, preferences, and notable outcomes; skip greetings, acknowledgments, tool noise, and trivial chatter.
- **Clean memory**: remove metadata, sender/timestamp noise, assistant wrapper tags, reasoning, and transport artifacts before persistence or recall.
- **Safe memory**: enforce timeout protection and empty/trivial input guards so startup and turn processing remain responsive.
- **Structured memory**: move away from delimiter-heavy pseudo-XML toward structured JSON serialization for durable ingestion.

## Key design decisions

- **Curation stays narrow; recall can widen**
  - Curation is limited to the **current completed turn**.
  - Recall may use a **recent history window** to improve context.

- **Prefer the latest cleaned user query**
  - Fall back to history scanning only when needed.
  - Skip trivially short queries to avoid unnecessary recall work.

- **Recall is best-effort**
  - Use a timeout guard / `AbortController` so startup is not blocked.

- **Serialization must be robust**
  - Avoid delimiter collisions and oversized payloads.
  - Cap or truncate tool output.
  - Omit reasoning from durable memory.

## Shared implementation patterns

Across the entries, the same flow appears repeatedly:

- current-turn message fetching and formatting as the base path
- idle/compaction triggers driving curation persistence
- system transform driving recall injection
- bridge readiness checks, empty-input handling, and failure visibility as reliability controls

## Drill-down entries

### `byterover_context_engine_ideas.md`
High-level context engine design:
- after-turn persistence vs assemble-time recall
- only retain lasting-value content
- strip metadata, sender/timestamp noise, and assistant tags
- use the latest cleaned user prompt for recall
- best-effort recall with timeout protection

### `byterover_plugin_curation_and_recall.md`
Serialization strategy in `dot_config/opencode/plugins/byterover.ts`:
- current formatter serializes message parts with role labels and separators
- risks include delimiter collisions, `undefined` JSON values, and oversized tool outputs
- recommendation is structured JSON serialization with truncation
- preserves idle/compaction persistence and system-transform recall injection flow

### `byterover_plugin_recall_and_curation.md`
Reliability improvements in the plugin:
- include the latest user message in serialized turns
- skip empty text-only serialization and empty recall results
- check `brvBridge.ready()` before recall and curation
- use blocking persist status checks with `detach: false`
- observe background curation failures
- wire bridge logging into `client.app.log`

### `byterover_recall_window_update.md`
Recall-window behavior change:
- recall gets a separate recent window
- limit window to **3 recent user turns** or **4096 formatted characters**
- curation remains current-turn only
- serialization stays text-only, excluding tools, files, and reasoning

### `recall_and_curation_improvements.md`
Follow-up improvements to the same architecture:
- add a best-effort recall timeout
- rename the curation prompt label to **Conversation**
- optionally log recall window size
- consider deduping repeated idle curation
- handle oversize first-message edge cases carefully

### `review_agent_prompt_refinement.md`
Adjacent prompt-quality work, not memory handling:
- refines reviewer prompt toward evidence-based reviewing
- clarifies severity ordering and no-edit behavior
- review output format is fixed to **Correct / Fixed / Blocker / Note**
- verification passed except `markdownlint-cli2` was unavailable

## Relationships and dependencies

- The plugin behavior entries are tightly linked through `dot_config/opencode/plugins/byterover.ts`.
- The recall-window update builds on the earlier curation/recall design and narrows recall to bounded recent history.
- The improvement recommendations extend the same architecture with timeout, labeling, and debug-logging suggestions.
- The review prompt refinement is separate infrastructure work focused on review discipline rather than memory handling.

## Overall takeaway

The system converges on one operational principle: **capture only durable signal, clean it aggressively, and recall it in a bounded, failure-tolerant way**. The main priorities are selective persistence, structured serialization, recent-window recall, and defensive guards around bridge readiness, empty inputs, and startup latency.