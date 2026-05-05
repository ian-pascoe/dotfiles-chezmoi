---
children_hash: c203924b3248a2c8f7aa3470a14e5303e5a4c8944fc410ae82f30773baeeb24a
compression_ratio: 0.30999703352121033
condensation_order: 3
covers: [_index.sync-conflict-20260503-134830-QVX6PJM.md, _index.sync-conflict-20260503-134835-QVX6PJM.md, architecture/_index.md]
covers_token_total: 3371
summary_level: d3
token_count: 1045
type: summary
---
# ByteRover / Opencode Recall-Curation and Review Refinements

This d3 cluster summarizes a linked set of Opencode/ByteRover notes on memory handling, bounded recall, and review-agent discipline. The memory thread moves from conceptual design to plugin behavior, then to stricter recall limits and stabilization ideas; review-prompt work is adjacent and shares the same environment.

## Memory-engine foundations
- **`byterover_context_engine_ideas.md`** defines the core context-engine strategy:
  - curate only lasting-value content
  - strip metadata, assistant wrapper tags, and tool noise
  - prefer the latest cleaned user query for recall
  - keep recall best-effort with timeout protection
- The design separates **after-turn persistence** from **assemble-time recall**:
  - persistence serializes only the new turn
  - recall injects curated knowledge as a system-prompt addition
- Supporting mechanics include metadata stripping, sender/timestamp extraction, assistant-tag removal, and abort-controller timeout guards.

## Plugin curation and recall behavior
- **`byterover_plugin_curation_and_recall.md`** documents the concrete behavior of `dot_config/opencode/plugins/byterover.ts`.
- The turn pipeline is:
  - fetch messages in the current turn
  - format role-labeled parts
  - persist on idle/compaction
  - recall during system transform
- Key implementation decisions:
  - readiness checks were removed from the persist/curation path
  - `brvBridge.ready()` remains only for recall
  - first-run bootstrap is preserved when `.brv` does not yet exist
  - `persist(..., { detach: false })` is used when completion status must be checked
- Reliability findings:
  - delimiter-based pseudo-XML formatting is brittle
  - structured JSON serialization is preferred
  - reasoning parts should be excluded from durable memory ingestion
  - tool outputs should be capped or truncated
  - empty inputs and empty recall results are skipped
  - bridge failures surface through `client.app.log`
- Verification included formatter, linter, and TypeScript checks.

## Bounded recall window
- **`byterover_recall_window_update.md`** narrows recall scope in `dot_config/opencode/plugins/byterover.ts`.
- Recall now uses a separate recent window bounded by:
  - **3 recent user turns**
  - **4096 formatted characters**
- Curation remains limited to the **current completed turn**.
- Serialization stays **main-text only**, excluding tools, files, and reasoning.
- Use this entry for the exact recall-window limits and the curation-vs-recall split.

## Follow-up hardening ideas
- **`recall_and_curation_improvements.md`** captures next-step stabilization ideas:
  - add a best-effort recall timeout with `AbortController`
  - rename the curation prompt label to **Conversation**
  - optionally log recall window size
  - consider deduping repeated idle curation
  - handle oversize first-message edge cases
- It preserves an important heuristic:
  - do not blindly skip short but meaningful messages like “Do it”, “yes”, or “same”
  - trivial chatter can still be skipped when clearly non-referential

## Review-agent prompt refinement
- **`review_agent_prompt_refinement.md`** focuses on review quality in `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc`.
- The prompt was refined to emphasize:
  - review vs. solving separation
  - evidence-based findings
  - severity ordering
  - no-edit behavior when review-only instructions apply
  - concise output sections: **Correct, Fixed, Blocker, Note**
- Verification succeeded for JSONC parsing, markdown structure, and `git diff --check`; `markdownlint-cli2` was unavailable.

## Relationship map
- The memory-related entries form a progression:
  - **`byterover_context_engine_ideas.md`** → conceptual rules
  - **`byterover_plugin_curation_and_recall.md`** → plugin implementation
  - **`byterover_recall_window_update.md`** → bounded recall scope
  - **`recall_and_curation_improvements.md`** → stabilization and hardening ideas
- **`review_agent_prompt_refinement.md`** is adjacent work in the same Opencode/ByteRover environment, but it targets review discipline rather than memory serialization.