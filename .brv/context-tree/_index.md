---
children_hash: a1508d6573d288901d0ac60dc8c0375f3ea5e5d7d1c18aa97e15f6ac1357ec0c
compression_ratio: 0.9331761006289309
condensation_order: 3
covers: [architecture/_index.md]
covers_token_total: 1272
summary_level: d3
token_count: 1187
type: summary
---
## architecture

This set of entries documents the evolution of `dot_config/opencode/plugins/byterover.ts` into a bounded, noise-resistant memory system that separates **durable memory ingestion** from **runtime recall**. The overall direction is consistent across the child entries: keep only lasting-value content, make recall best-effort and timeout-bounded, and avoid indiscriminate history ingestion.

### Core architectural direction
- Durable memory preserves only facts, decisions, technical details, preferences, and notable outcomes.
- Non-durable content is excluded: chatter, acknowledgments, tool noise, reasoning traces, transport metadata, and empty/near-empty content.
- Recall is constrained and protected by timeouts so it cannot block the agent path.
- Curation and recall are explicit, bounded paths rather than full-conversation persistence.

### Entry drill-down map

#### `byterover_context_engine_ideas.md`
Covers the broader context-engine model:
- After-turn persistence stores only new turn messages.
- Recall prefers the latest cleaned user query, falling back to history scanning only when needed.
- Cleaning strips user metadata and assistant wrapper tags before persistence and recall.
- Tool results and trivial chatter are skipped.
- Recall ignores trivially short queries and uses a timeout guard.

Use this entry for the general **noise control + selective persistence + best-effort recall** design.

#### `byterover_plugin_curation_and_recall.md`
Focuses on message serialization and the recall pipeline:
- Turn messages are fetched and serialized for idle/compaction persistence or system-transform recall injection.
- The current formatter uses bracketed role headers, reasoning tags, file tags, tool tags, and separator lines.
- Recommended direction is **structured JSON serialization** rather than delimiter-based pseudo-XML due to delimiter collisions, undefined JSON values, and large tool outputs.
- `brvBridge.ready()` was removed from the curation/persist path and retained only for recall.
- Idle and compaction triggers remain part of curation behavior.

Best drill-down for **serialization strategy**, **bridge readiness behavior**, **recall injection format**, and **tool-output truncation/capping**.

#### `byterover_plugin_recall_and_curation.md`
Covers reliability and correctness improvements:
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
- The system converges on a two-path model:
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
- Preservation rules consistently exclude reasoning, tool output noise, trivial acknowledgments, metadata wrappers, and empty or near-empty content.

### Best drill-down by concern
- **General context-engine philosophy** → `byterover_context_engine_ideas.md`
- **Serialization and memory ingestion format** → `byterover_plugin_curation_and_recall.md`
- **Reliability, readiness, and empty-input handling** → `byterover_plugin_recall_and_curation.md`
- **Bounded recent-history recall window** → `byterover_recall_window_update.md`