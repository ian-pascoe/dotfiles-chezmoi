---
children_hash: 915e0fffc2944bd1e133acd99d450902107c17e29cfffbb4fd62848f0ddf50d9
compression_ratio: 0.2918502202643172
condensation_order: 2
covers: [_index.sync-conflict-20260503-134830-QVX6PJM.md, _index.sync-conflict-20260503-134835-QVX6PJM.md, opencode/_index.md]
covers_token_total: 3632
summary_level: d2
token_count: 1060
type: summary
---
# ByteRover / Opencode Recall-Curation and Review Refinements

This d2 cluster summarizes a connected set of Opencode/ByteRover architecture notes focused on memory handling, bounded recall, and review-agent discipline. The memory thread progresses from conceptual design to plugin implementation, then to narrowed recall scope and follow-up hardening ideas; the review prompt work is adjacent but shares the same environment.

## Memory-engine foundations
- **`byterover_context_engine_ideas.md`** establishes the core context-engine strategy:
  - curate only lasting-value content
  - strip metadata, assistant wrapper tags, and tool noise
  - prefer the latest cleaned user query for recall
  - keep recall best-effort with timeout protection
- The design cleanly separates:
  - **after-turn persistence**: serialize only the new turn
  - **assemble-time recall**: inject curated knowledge as a system prompt addition
- Supporting mechanics include metadata stripping, sender/timestamp extraction, assistant-tag removal, and abort-controller timeout guards.

## Plugin curation, persistence, and recall
- **`byterover_plugin_curation_and_recall.md`** is the canonical implementation note for `dot_config/opencode/plugins/byterover.ts`.
- It documents the turn pipeline:
  - fetch messages in the current turn
  - format role-labeled parts
  - persist on idle/compaction
  - recall during system transform
- Key decisions and findings:
  - readiness checks were removed from the persist/curation path
  - `brvBridge.ready()` remains only for recall
  - first-run bootstrap is preserved when `.brv` does not yet exist
  - `persist(..., { detach: false })` is used when completion status must be checked
  - delimiter-based pseudo-XML formatting is brittle
  - structured JSON serialization is preferred
  - reasoning parts are excluded from durable memory ingestion
  - tool outputs are capped or truncated
  - empty inputs and empty recall results are skipped
  - bridge failures surface through `client.app.log`
- Verification included formatter, linter, and TypeScript checks.

## Bounded recall window
- **`byterover_recall_window_update.md`** narrows the recall path for `dot_config/opencode/plugins/byterover.ts`.
- Recall now uses a separate recent window bounded by:
  - **3 recent user turns**
  - **4096 formatted characters**
- Curation remains limited to the **current completed turn**.
- Serialization stays **main-text only**, excluding tools, files, and reasoning.
- Use this entry for the exact recall-window limits and the curation-vs-recall split.

## Follow-up hardening ideas
- **`recall_and_curation_improvements.md`** records recommended next steps:
  - add a best-effort recall timeout with `AbortController`
  - rename the curation prompt label to **Conversation**
  - optionally log recall window size
  - consider deduping repeated idle curation
  - handle oversize first-message edge cases
- It also preserves a key heuristic:
  - do not blindly skip short but meaningful messages like “Do it”, “yes”, or “same”
  - trivial chatter can still be skipped when clearly non-referential

## Review-agent prompt refinement
- **`review_agent_prompt_refinement.md`** is adjacent infrastructure work in `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc`.
- The prompt was refined to emphasize:
  - review vs. solving separation
  - evidence-based findings
  - severity ordering
  - no-edit behavior when review-only instructions apply
  - concise output sections: **Correct, Fixed, Blocker, Note**
- Verification succeeded for JSONC parsing, markdown structure, and `git diff --check`; `markdownlint-cli2` was unavailable.

## Relationships across the cluster
- The memory-focused entries form a progression:
  - **`byterover_context_engine_ideas.md`** sets the conceptual rules
  - **`byterover_plugin_curation_and_recall.md`** captures the concrete plugin behavior
  - **`byterover_recall_window_update.md`** constrains recall scope with explicit bounds
  - **`recall_and_curation_improvements.md`** proposes next-step stabilization
- **`review_agent_prompt_refinement.md`** shares the same Opencode/ByteRover environment but focuses on review discipline rather than memory serialization.