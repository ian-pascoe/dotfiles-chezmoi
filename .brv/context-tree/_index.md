---
children_hash: e5d6504581ccb285e1fdb1445d9fc017dcfab0a26171bb55ca89aaa61b48b68b
compression_ratio: 0.2612032681356771
condensation_order: 3
covers: [_index.sync-conflict-20260503-134830-QVX6PJM.md, _index.sync-conflict-20260503-134835-QVX6PJM.md, architecture/_index.md, dot_config/_index.md, facts/_index.md]
covers_token_total: 4039
summary_level: d3
token_count: 1055
type: summary
---
# Architecture / Opencode: Memory, Recall, and Review Refinements

This d3 cluster covers a connected set of Opencode/Byterover changes focused on durable memory, bounded recall, curation behavior, and review-prompt discipline. The entries form a progression from conceptual design to plugin implementation, then to recall scoping and hardening ideas, with adjacent work on review output quality.

## Memory engine foundation
- **`byterover_context_engine_ideas.md`** defines the core memory strategy:
  - curate only lasting-value content
  - strip metadata, assistant wrapper tags, and tool noise
  - prefer the latest cleaned user query for recall
  - keep recall best-effort with timeout protection
- The design separates **after-turn persistence** from **assemble-time recall**:
  - persistence serializes only the new turn
  - recall injects curated knowledge as a system-prompt addition
- Supporting logic includes metadata stripping, sender/timestamp extraction, assistant-tag removal, and abort-controller timeout guards.

## Plugin curation and recall behavior
- **`byterover_plugin_curation_and_recall.md`** documents the concrete behavior of `dot_config/opencode/plugins/byterover.ts`.
- The turn-processing pipeline is:
  - fetch messages in the current turn
  - format role-labeled parts
  - persist on idle/compaction
  - recall during system transform
- Key implementation choices:
  - readiness checks were removed from the persist/curation path
  - `brvBridge.ready()` remains only for recall
  - first-run bootstrap behavior is preserved when `.brv` does not yet exist
  - `persist(..., { detach: false })` is used when completion status must be checked
- Reliability findings:
  - delimiter-based pseudo-XML formatting is brittle
  - structured JSON serialization is preferred
  - reasoning parts should be excluded from durable memory ingestion
  - tool outputs should be capped or truncated
  - empty inputs and empty recall results are skipped
  - bridge failures are surfaced through `client.app.log`
- Verification included formatter, linter, and TypeScript checks.

## Bounded recall window
- **`byterover_recall_window_update.md`** narrows recall scope in `dot_config/opencode/plugins/byterover.ts`.
- Recall now uses a separate recent window bounded by:
  - **3 recent user turns**
  - **4096 formatted characters**
- Curation remains limited to the **current completed turn**.
- Serialization stays **main-text only**, excluding tools, files, and reasoning.
- This entry is the source for the exact recall-window limits and the curation-vs-recall split.

## Follow-up hardening ideas
- **`recall_and_curation_improvements.md`** records next-step stabilization ideas:
  - add a best-effort recall timeout with `AbortController`
  - rename the curation prompt label to **Conversation**
  - optionally log recall window size
  - consider deduping repeated idle curation
  - handle oversize first-message edge cases
- It preserves an important heuristic:
  - do not blindly skip short but meaningful messages like “Do it”, “yes”, or “same”
  - trivial chatter can still be skipped when clearly non-referential

## Review agent prompt refinement
- **`review_agent_prompt_refinement.md`** focuses on review quality in `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc`.
- The prompt was refined to emphasize:
  - review vs. solving separation
  - evidence-based findings
  - severity ordering
  - no-edit behavior when review-only instructions apply
  - concise output sections: **Correct, Fixed, Blocker, Note**
- Verification succeeded for JSONC parsing, markdown structure, and `git diff --check`; `markdownlint-cli2` was unavailable.

## Relationship map
- The memory-related entries form a clear progression:
  - **`byterover_context_engine_ideas.md`** → conceptual rules
  - **`byterover_plugin_curation_and_recall.md`** → plugin implementation
  - **`byterover_recall_window_update.md`** → bounded recall scope
  - **`recall_and_curation_improvements.md`** → stabilization and hardening ideas
- **`review_agent_prompt_refinement.md`** is adjacent work in the same Opencode/Byterover environment, but it targets review discipline rather than memory serialization.