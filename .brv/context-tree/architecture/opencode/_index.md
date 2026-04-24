---
children_hash: f3b242b644eaedc8e7550595b51a95dbd16f83184bea3766d41dbd5fdc185511
compression_ratio: 0.3721770551038844
condensation_order: 1
covers: [byterover_context_engine_ideas.md, byterover_plugin_curation_and_recall.md, byterover_plugin_recall_and_curation.md, byterover_recall_window_update.md]
covers_token_total: 3321
summary_level: d1
token_count: 1236
type: summary
---
## ByteRover / OpenCode Plugin Context Overview

This set of entries documents the evolution of `dot_config/opencode/plugins/byterover.ts` across curation, recall, serialization, and recall-window handling. The main architectural theme is separating **durable memory ingestion** from **runtime recall**, while keeping both paths safe, bounded, and noise-resistant.

### Core design principles
- Preserve only **lasting-value content** for memory: facts, decisions, technical details, preferences, and notable outcomes.
- Exclude trivial chatter, greetings, acknowledgments, tool noise, reasoning traces, and transport metadata.
- Prefer **best-effort recall** with timeout protection so memory operations do not block the agent path.
- Keep recall and curation behavior **bounded and explicit**, rather than ingesting entire conversation history indiscriminately.

### Entry drill-down map

#### `byterover_context_engine_ideas.md`
Captures the broader context-engine ideas behind the ByteRover/OpenClaw approach:
- After-turn persistence stores only new turn messages.
- Recall uses the latest cleaned user query when possible, falling back to history scanning only if needed.
- Message cleaning strips user metadata and assistant wrapper tags before persistence/recall.
- Tool results and trivial chatter are skipped.
- Recall uses a timeout guard and skips trivially short queries.

This entry is the best place to drill into the general **noise control + selective persistence + best-effort recall** model.

#### `byterover_plugin_curation_and_recall.md`
Documents the plugin’s message serialization and recall pipeline:
- Turn messages are fetched and serialized for either idle/compaction persistence or system-transform recall injection.
- The current formatter uses bracketed role headers, reasoning tags, file tags, tool tags, and separator lines.
- Recommended direction is **structured JSON serialization** instead of delimiter-based pseudo-XML, due to delimiter collisions, undefined JSON values, and oversized tool outputs.
- `brvBridge.ready()` was removed from the curation/persist path and kept only for recall.
- Idle and compaction triggers remain part of curation behavior.

Key drill-down topics here:
- serialization strategy
- bridge readiness behavior
- recall injection format
- truncation/capping of tool output
- validation and bootstrap behavior

#### `byterover_plugin_recall_and_curation.md`
Focuses on reliability and correctness improvements in the plugin:
- The latest user message is included in serialized turns for recall and curation.
- Empty text-only inputs, empty serialized turns, and empty recall results are skipped.
- `brvBridge.ready()` guards both recall and curation.
- Curation completion checks use `persist(..., { detach: false })`.
- Idle curation is wrapped in an observed background promise.
- Background failures are surfaced via `client.app.log`.
- Recall prompt formatting and a typo were corrected.

This entry is the drill-down source for the plugin’s **safety checks, empty-input handling, and observability** behavior.

#### `byterover_recall_window_update.md`
Describes the bounded recent-window behavior for recall:
- Recall now uses a separate recent context window capped at **3 recent user turns** or **4096 formatted characters**.
- Curation still uses only the **current completed turn**.
- Serialization remains **main-text-only**, excluding tools, files, and reasoning.
- The update preserves bounded recall scope while improving historical context availability.

This is the best drill-down for the **recall window policy** and its separation from curation scope.

### Shared architectural relationships
- All entries point back to `dot_config/opencode/plugins/byterover.ts` as the implementation site.
- The overall system is converging on a two-path model:
  - **Curation/persistence**: current-turn, lasting-value content only.
  - **Recall**: bounded recent context, cleaned and injected into system prompt flow.
- Reliability measures recur across entries:
  - readiness checks
  - empty-result skipping
  - timeout/best-effort behavior
  - explicit logging of bridge failures
  - validation via formatter/linter/typecheck

### Important recurring patterns
- Cleaned transcript formatting uses role-prefixed lines such as `[user]: ...` and `[assistant]: ...`.
- Recall injection uses a context wrapper around recalled text.
- Preservation rules consistently exclude:
  - reasoning
  - tool output noise
  - trivial acknowledgments
  - metadata wrappers
  - empty or near-empty content

### Best places to drill down by concern
- **General context-engine philosophy** → `byterover_context_engine_ideas.md`
- **Serialization and memory ingestion format** → `byterover_plugin_curation_and_recall.md`
- **Reliability, readiness, and empty-input handling** → `byterover_plugin_recall_and_curation.md`
- **Bounded recall history window** → `byterover_recall_window_update.md`