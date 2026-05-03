---
children_hash: 31ba3d9142966b2b88b91a36b267de46aacb4f613be43c681adb7e9023ec209e
compression_ratio: 0.2634631317315659
condensation_order: 1
covers: [byterover_context_engine_ideas.md, byterover_plugin_curation_and_recall.md, byterover_plugin_recall_and_curation.md, byterover_recall_window_update.md, recall_and_curation_improvements.md, review_agent_prompt_refinement.md]
covers_token_total: 4828
summary_level: d1
token_count: 1272
type: summary
---
## ByteRover / OpenCode Context Engine and Plugin Behavior

This set of entries describes a coherent design evolution around **curating durable memory from chat turns** and **reliably recalling that memory during runtime**. The main architectural split is between:

- **curation/persistence**: store only lasting-value content from completed turns
- **recall/injection**: restore a bounded, cleaned recent context into the system prompt

### Core design themes
- Keep memory **selective**: preserve facts, decisions, technical details, preferences, and notable outcomes; skip greetings, acknowledgments, tool noise, and other trivial messages.
- Keep memory **clean**: strip metadata, assistant wrapper tags, reasoning, and other transport noise before persistence or recall.
- Keep memory **safe**: add best-effort timeout protection and skip empty or trivial recall inputs so startup and turn processing stay responsive.
- Keep memory **structured**: move away from delimiter-heavy pseudo-XML formatting toward structured JSON serialization for durable ingestion.

### Key architectural decisions
- **Separate recall from curation scope**
  - Curation stays limited to the **current completed turn**.
  - Recall may use a **recent window** of history to improve context.
- **Recall should prefer the latest cleaned user query**
  - Fall back to scanning history only when necessary.
  - Skip trivially short queries to avoid unnecessary recall calls.
- **Recall should be best-effort**
  - Use a timeout guard / AbortController so startup is not blocked.
- **Serialization should be robust**
  - Avoid delimiter collisions and oversized payloads.
  - Cap or truncate tool output.
  - Omit reasoning from durable memory.

### Shared patterns across the plugin entries
- Current-turn message fetching and formatting is the base flow.
- Idle/compaction triggers drive curation persistence.
- System transform drives recall injection.
- Bridge readiness, empty-input checks, and failure visibility are central reliability controls.

### Drill-down by entry

#### `byterover_context_engine_ideas.md`
Captures the high-level context engine approach:
- after-turn persistence vs assemble-time recall
- only keep lasting-value content
- strip metadata, sender/timestamp noise, and assistant tags
- use the latest cleaned user prompt for recall
- best-effort recall with timeout protection

#### `byterover_plugin_curation_and_recall.md`
Focuses on serialization strategy in `dot_config/opencode/plugins/byterover.ts`:
- current formatter serializes message parts with role labels and separators
- risks: delimiter collisions, undefined JSON values, oversized tool outputs
- recommendation: structured JSON serialization with truncation
- preserves idle/compaction persistence and system-transform recall injection flow

#### `byterover_plugin_recall_and_curation.md`
Documents reliability improvements in the plugin:
- include the latest user message in serialized turns
- skip empty text-only serialization and empty recall results
- check `brvBridge.ready()` before recall and curation
- use blocking persist status checks with `detach: false`
- observe background curation failures
- wire bridge logging into `client.app.log`

#### `byterover_recall_window_update.md`
Describes the recall-window behavior change:
- recall gets a separate recent window
- limit window to **3 recent user turns** or **4096 formatted characters**
- curation remains current-turn only
- serialization stays text-only, excluding tools, files, and reasoning

#### `recall_and_curation_improvements.md`
Lists recommended follow-up improvements:
- add a best-effort recall timeout
- rename the curation prompt label to **Conversation**
- optionally log recall window size
- consider deduping repeated idle curation
- handle oversize first-message edge cases carefully

#### `review_agent_prompt_refinement.md`
A related but separate prompt-quality entry:
- refines the reviewer prompt to emphasize evidence-based reviewing
- clarifies severity ordering and no-edit behavior
- review output format is fixed to **Correct / Fixed / Blocker / Note**
- verification passed except `markdownlint-cli2` was unavailable

### Relationships and dependencies
- The plugin behavior entries are tightly linked through `dot_config/opencode/plugins/byterover.ts`.
- The recall-window update builds on the earlier curation/recall design and narrows the recall context to a bounded recent history.
- The improvement recommendations extend the same architecture with timeout, labeling, and debug-logging suggestions.
- The review prompt refinement is adjacent infrastructure work, focused on review discipline rather than memory handling.

### Overall takeaway
The curated knowledge converges on a single operational principle: **capture only durable signal, clean it aggressively, and recall it in a bounded, failure-tolerant way**. The most important implementation priorities are selective persistence, structured serialization, recent-window recall, and defensive guards around bridge readiness, empty inputs, and startup latency.