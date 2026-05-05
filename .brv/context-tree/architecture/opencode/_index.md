---
children_hash: 42ebba91f6cec3ae7e8b34d21474e3ab3b036dc0acde850404002f52d4996003
compression_ratio: 0.053440627256783245
condensation_order: 1
covers: [_index.sync-conflict-20260503-134830-QVX6PJM.md, _index.sync-conflict-20260503-134835-QVX6PJM.md, byterover_context_engine_ideas.md, byterover_context_engine_ideas.sync-conflict-20260503-134824-QVX6PJM.md, byterover_context_engine_ideas.sync-conflict-20260503-134832-QVX6PJM.md, byterover_plugin_curation_and_recall.md, byterover_plugin_curation_and_recall.sync-conflict-20260503-134830-QVX6PJM.md, byterover_plugin_curation_and_recall.sync-conflict-20260503-134835-QVX6PJM.md, byterover_recall_window_update.md, byterover_recall_window_update.sync-conflict-20260503-134824-QVX6PJM.md, byterover_recall_window_update.sync-conflict-20260503-134834-QVX6PJM.md, recall_and_curation_improvements.md, recall_and_curation_improvements.sync-conflict-20260503-134824-QVX6PJM.md, recall_and_curation_improvements.sync-conflict-20260503-134834-QVX6PJM.md, recall_window_and_curation_pipeline.md, review_agent_prompt_refinement.md, review_agent_prompt_refinement.sync-conflict-20260503-134824-QVX6PJM.md, review_agent_prompt_refinement.sync-conflict-20260503-134834-QVX6PJM.md]
covers_token_total: 19386
summary_level: d1
token_count: 1036
type: summary
---
# ByteRover / Opencode Recall-Curation and Review Prompt Refinements

This cluster covers a coherent set of Opencode/ByteRover architecture notes centered on memory handling, bounded recall, and review-agent discipline. The first four entries form the memory pipeline thread; the last entry is adjacent prompt-work in the same environment.

## Memory engine foundations
- **`byterover_context_engine_ideas.md`** defines the core context-engine approach:
  - curate only lasting-value content
  - strip metadata, assistant wrapper tags, and tool noise
  - prefer the latest cleaned user query for recall
  - keep recall best-effort with timeout protection
- The design separates **after-turn persistence** from **assemble-time recall**:
  - persistence serializes only the new turn
  - recall injects curated knowledge as a system prompt addition
- Key helper dependencies include metadata stripping, sender/timestamp extraction, assistant-tag removal, and abort-controller timeout guards.

## Plugin serialization, persistence, and recall
- **`byterover_plugin_curation_and_recall.md`** is the canonical note for `dot_config/opencode/plugins/byterover.ts`.
- It documents the turn-processing pipeline:
  - fetch messages in the current turn
  - format role-labeled parts
  - persist on idle/compaction
  - recall during system transform
- Important decisions and findings:
  - readiness checks were removed from the persist/curation path
  - `brvBridge.ready()` remains only for recall
  - first-run bootstrap behavior is preserved when `.brv` does not yet exist
  - `persist(..., { detach: false })` is used when completion status must be checked
  - delimiter-based pseudo-XML formatting is brittle
  - structured JSON serialization is the recommended direction
  - reasoning parts should be omitted from durable memory ingestion
  - tool outputs should be capped/truncated
  - empty inputs and empty recall results are skipped
  - bridge failures are surfaced through `client.app.log`
- Verification included formatter, linter, and TypeScript checks.

## Bounded recall window
- **`byterover_recall_window_update.md`** narrows the recall path for `dot_config/opencode/plugins/byterover.ts`.
- Recall now uses a **separate recent window** capped at:
  - **3 recent user turns**
  - **4096 formatted characters**
- Curation remains limited to the **current completed turn**.
- Serialization stays **main-text only**, excluding tools, files, and reasoning.
- This entry is the source for the exact recall-window limits and the recall-vs-curation split.

## Follow-up recommendations
- **`recall_and_curation_improvements.md`** records proposed hardening steps:
  - add a best-effort recall timeout with `AbortController`
  - rename the curation prompt label to **Conversation**
  - optionally log recall window size
  - consider deduping repeated idle curation
  - handle oversize first-message edge cases
- It also preserves the key heuristic that short messages like “Do it”, “yes”, or “same” should not be blindly skipped if they are referential.

## Review-agent prompt refinement
- **`review_agent_prompt_refinement.md`** is adjacent infrastructure work in `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc`.
- The prompt was refined to emphasize:
  - review vs. solving separation
  - evidence-based findings
  - severity ordering
  - no-edit behavior when review-only instructions apply
  - concise output sections: **Correct, Fixed, Blocker, Note**
- Verification passed for JSONC parsing, markdown structure, and `git diff --check`, but `markdownlint-cli2` was unavailable.

## Overall relationships
- The memory-handling thread progresses in order:
  - **`byterover_context_engine_ideas.md`** sets the conceptual rules
  - **`byterover_plugin_curation_and_recall.md`** captures the concrete plugin behavior
  - **`byterover_recall_window_update.md`** constrains recall scope
  - **`recall_and_curation_improvements.md`** proposes next-step hardening
- **`review_agent_prompt_refinement.md`** shares the same Opencode/ByteRover environment but focuses on review discipline rather than memory serialization.