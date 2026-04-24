---
children_hash: 255beb58f6c3573f99f20171235fccdcf7cd7f22a53c161ea4ebe25df74d0e58
compression_ratio: 0.9076576576576577
condensation_order: 2
covers: [opencode/_index.md]
covers_token_total: 1332
summary_level: d2
token_count: 1209
type: summary
---
## ByteRover / OpenCode Plugin Context Overview

These entries describe the evolution of `dot_config/opencode/plugins/byterover.ts` around curation, recall, serialization, and recent-window handling. The consistent architectural direction is to separate **durable memory ingestion** from **runtime recall**, while keeping both paths bounded, noise-resistant, and safe.

### Core architectural principles
- Preserve only **lasting-value content** for memory: facts, decisions, technical details, preferences, and notable outcomes.
- Exclude trivial chatter, greetings, acknowledgments, tool noise, reasoning traces, and transport metadata.
- Use **best-effort recall** with timeout protection so memory operations do not block the agent path.
- Keep recall and curation explicit and bounded rather than ingesting full conversation history indiscriminately.

### Entry drill-down map

#### `byterover_context_engine_ideas.md`
Covers the broader context-engine model behind the ByteRover/OpenCode approach:
- After-turn persistence stores only new turn messages.
- Recall prefers the latest cleaned user query, falling back to history scanning only if needed.
- Message cleaning strips user metadata and assistant wrapper tags before persistence and recall.
- Tool results and trivial chatter are skipped.
- Recall uses a timeout guard and ignores trivially short queries.

Use this entry for the general **noise control + selective persistence + best-effort recall** design.

#### `byterover_plugin_curation_and_recall.md`
Focuses on message serialization and the recall pipeline:
- Turn messages are fetched and serialized for either idle/compaction persistence or system-transform recall injection.
- The current formatter uses bracketed role headers, reasoning tags, file tags, tool tags, and separator lines.
- Recommended direction is **structured JSON serialization** instead of delimiter-based pseudo-XML because of delimiter collisions, undefined JSON values, and oversized tool outputs.
- `brvBridge.ready()` was removed from the curation/persist path and retained only for recall.
- Idle and compaction triggers remain part of curation behavior.

Best place to drill into **serialization strategy**, **bridge readiness behavior**, **recall injection format**, and **tool output truncation/capping**.

#### `byterover_plugin_recall_and_curation.md`
Covers reliability and correctness improvements in the plugin:
- The latest user message is included in serialized turns for recall and curation.
- Empty text-only inputs, empty serialized turns, and empty recall results are skipped.
- `brvBridge.ready()` guards both recall and curation.
- Curation completion uses `persist(..., { detach: false })`.
- Idle curation is wrapped in an observed background promise.
- Background failures are surfaced through `client.app.log`.
- Recall prompt formatting and a typo were corrected.

Use this entry for **safety checks**, **empty-input handling**, and **observability** behavior.

#### `byterover_recall_window_update.md`
Describes the bounded recent-window policy for recall:
- Recall uses a separate recent context window capped at **3 recent user turns** or **4096 formatted characters**.
- Curation still uses only the **current completed turn**.
- Serialization remains **main-text-only**, excluding tools, files, and reasoning.
- The update keeps recall bounded while improving historical context availability.

Best drill-down for the **recall window policy** and the separation between recall scope and curation scope.

### Shared relationships across entries
- All entries point back to `dot_config/opencode/plugins/byterover.ts` as the implementation site.
- The system is converging on a two-path model:
  - **Curation/persistence**: current-turn, lasting-value content only.
  - **Recall**: bounded recent context, cleaned and injected into system-prompt flow.
- Reliability patterns recur throughout:
  - readiness checks
  - empty-result skipping
  - timeout/best-effort behavior
  - explicit bridge failure logging
  - validation via formatter/linter/typecheck

### Recurring formatting and exclusion patterns
- Cleaned transcript formatting uses role-prefixed lines such as `[user]: ...` and `[assistant]: ...`.
- Recall injection wraps recalled text in a context container.
- Preservation rules consistently exclude:
  - reasoning
  - tool output noise
  - trivial acknowledgments
  - metadata wrappers
  - empty or near-empty content

### Best drill-down by concern
- **General context-engine philosophy** → `byterover_context_engine_ideas.md`
- **Serialization and memory ingestion format** → `byterover_plugin_curation_and_recall.md`
- **Reliability, readiness, and empty-input handling** → `byterover_plugin_recall_and_curation.md`
- **Bounded recent-history recall window** → `byterover_recall_window_update.md`