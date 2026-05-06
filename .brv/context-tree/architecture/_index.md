---
children_hash: ff0fbbba609a4565b94246d7c99b3d6e505e3c80e6f95c3aa3b03355f6bd808c
compression_ratio: 0.2870939420544337
condensation_order: 2
covers: [_index.sync-conflict-20260503-134830-QVX6PJM.md, _index.sync-conflict-20260503-134835-QVX6PJM.md, opencode/_index.md]
covers_token_total: 3417
summary_level: d2
token_count: 981
type: summary
---
# ByteRover / Opencode Architecture Notes

This d2 cluster summarizes a connected set of Opencode/Byterover changes focused on memory durability, bounded recall, and review discipline. The memory-related entries form a progression from conceptual design to implementation, then to scope tightening and hardening ideas.

## Memory engine and recall/curation pipeline
- **`byterover_context_engine_ideas.md`** defines the core memory strategy:
  - curate only lasting-value content
  - strip metadata, assistant wrapper tags, and tool noise
  - prefer the latest cleaned user query for recall
  - keep recall best-effort with timeout protection
- **`byterover_plugin_curation_and_recall.md`** documents the concrete plugin behavior in `dot_config/opencode/plugins/byterover.ts`:
  - fetch current-turn messages
  - format role-labeled parts
  - persist on idle/compaction
  - recall during system transform
  - readiness checks removed from persist/curation, while `brvBridge.ready()` remains for recall
  - `.brv` bootstrap behavior preserved
  - structured JSON serialization preferred over brittle delimiter-based pseudo-XML
  - reasoning content excluded from durable memory ingestion; tool output is capped/truncated; empty inputs/results are skipped
- **`byterover_recall_window_update.md`** narrows recall scope:
  - separate recent window limited to **3 recent user turns** and **4096 formatted characters**
  - curation stays limited to the **current completed turn**
  - serialization remains **main-text only**; tools, files, and reasoning are excluded
- **`recall_and_curation_improvements.md`** captures follow-up hardening ideas:
  - add AbortController-based recall timeout
  - rename the curation label to **Conversation**
  - optionally log recall window size
  - consider deduping repeated idle curation
  - handle oversize first-message edge cases carefully
  - do not blindly skip short but meaningful messages like “Do it”, “yes”, or “same”

## Review-agent prompt refinement
- **`review_agent_prompt_refinement.md`** is adjacent infrastructure work in the same Opencode/Byterover environment.
- It updates `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc` to emphasize:
  - review vs. solving separation
  - evidence-based findings
  - severity ordering
  - no-edit behavior when review-only instructions apply
  - concise output sections: **Correct, Fixed, Blocker, Note**
- Verification succeeded for JSONC parsing, markdown structure, and `git diff --check`; `markdownlint-cli2` was unavailable.

## Relationships
- The first four entries form one coherent memory-handling thread:
  - **`byterover_context_engine_ideas.md`** = conceptual rules
  - **`byterover_plugin_curation_and_recall.md`** = implementation and validation findings
  - **`byterover_recall_window_update.md`** = bounded recall behavior
  - **`recall_and_curation_improvements.md`** = next-step hardening recommendations
- **`review_agent_prompt_refinement.md`** is related but distinct: it targets review behavior rather than memory serialization.

## Related neighboring plugin/workflow notes
- **`retry_plugin_backoff.md`** documents retry handling for overloaded API errors:
  - exponential backoff with full jitter
  - per-session retry tracking
  - retry state reset on non-overloaded errors
  - format/lint passed; typecheck blocked by missing `tsc`
- **`package_manifest_sync_workflow.md`** documents manifest refresh automation:
  - `dot_local/bin/executable_sync-package-manifests`
  - `dot_local/bin/executable_upgrade-all` runs sync before dotfiles pull
  - verification matched exported manifests; no `run_once_*` or `run_onchange_*` hooks were added
- **`neovim_ssh_clipboard_fix.md`** records the SSH clipboard fix:
  - force OSC52 clipboard provider in SSH sessions
  - set `clipboard=unnamedplus`
  - verified with `stylua --check` and an SSH startup check returning `ssh clipboard ok`