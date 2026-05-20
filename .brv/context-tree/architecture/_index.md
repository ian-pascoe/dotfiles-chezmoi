---
children_hash: 5dd17965cfeb2bd84d6d46c4fe1e4c7bf6823a51d41008ee3b5e105624bdfbca
compression_ratio: 0.5878559914024718
condensation_order: 2
covers: [idempotent-initialization-as-a-hardening-pattern.md, opencode/_index.md, prefer-structured-state-over-brittle-text-heuristics.md]
covers_token_total: 1861
summary_level: d2
token_count: 1094
type: summary
---
# d2 Structural Summary

## Core pattern across the cluster
This level-2 set converges on a single architectural direction: **make state explicit, replay-safe, and verifiable**. Across the memory pipeline, review workflow, and shell/plugin startup paths, the recurring choices are:
- **idempotent initialization**
- **structured state over text heuristics**
- **bounded, best-effort processing**
- **evidence-driven verification**

## Memory and recall/curation pipeline
### `opencode/_index.md`
The Opencode/Byterover cluster centers on memory handling and workflow hardening:
- Curate only lasting-value content.
- Strip metadata, wrapper tags, and tool noise.
- Prefer the latest cleaned user query for recall.
- Keep recall best-effort with timeout protection.
- Use structured JSON serialization instead of delimiter-heavy pseudo-XML.
- Exclude reasoning content from durable memory ingestion.
- Preserve `.brv` bootstrap behavior.
- Use `brvBridge.ready()` for recall, but remove readiness checks from persist/curation paths.

### Related memory-focused drill-down entries
- **`byterover_context_engine_ideas.md`**: conceptual memory rules and recall philosophy.
- **`byterover_plugin_curation_and_recall.md`**: concrete plugin behavior in `dot_config/opencode/plugins/byterover.ts`.
- **`byterover_recall_window_update.md`**: narrows scope to **3 recent user turns** and **4096 formatted characters**; curation remains limited to the current completed turn.
- **`recall_and_curation_improvements.md`**: follow-up hardening ideas such as AbortController timeouts, deduping repeated idle curation, and careful handling of short but meaningful replies.

## Review workflow refinement
### `review_agent_prompt_refinement.md`
This entry is adjacent infrastructure work, but distinct from memory handling:
- Updates `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc`.
- Enforces separation between **review** and **solving**.
- Requires **evidence-based findings** and severity ordering.
- Preserves **no-edit behavior** when review-only instructions apply.
- Uses concise output sections: **Correct, Fixed, Blocker, Note**.
- Verification passed for JSONC parsing, markdown structure, and `git diff --check`; `markdownlint-cli2` was unavailable.

## Broader architectural principle: structured state over heuristics
### `prefer-structured-state-over-brittle-text-heuristics.md`
A second cross-cutting principle reinforces the same direction:
- Replace brittle delimiter-based parsing with **structured JSON**.
- Use explicit role-labeled parts and cleaned turn extraction.
- Skip reasoning content and cap/truncate tool output.
- Verify curated results via explicit metadata such as `result.applied[].filePath`, not by rereading files.

## Startup hardening pattern
### `idempotent-initialization-as-a-hardening-pattern.md`
A broader hardening pattern links shell and plugin behavior:
- The zsh/Starship fix makes startup initialization **idempotent**, avoiding recursive widget wrapping when sourced multiple times.
- The Opencode memory plugin similarly stabilizes repeated bootstrap, persist, and recall cycles.
- Both favor recovery from partial or corrupted prior state rather than assuming a clean first-run environment.

## Adjacent workflow notes
These are neighboring implementation notes that support the same reliability theme:
- **`retry_plugin_backoff.md`**: overloaded API retries use exponential backoff with full jitter and per-session tracking.
- **`package_manifest_sync_workflow.md`**: manifest refresh is automated through `dot_local/bin/executable_sync-package-manifests` and `dot_local/bin/executable_upgrade-all`.
- **`neovim_ssh_clipboard_fix.md`**: SSH clipboard reliability is restored by forcing OSC52 and `clipboard=unnamedplus`.

## Drill-down relationships
The main memory-handling thread is:
1. **`byterover_context_engine_ideas.md`** — conceptual rules
2. **`byterover_plugin_curation_and_recall.md`** — implementation details
3. **`byterover_recall_window_update.md`** — bounded recall behavior
4. **`recall_and_curation_improvements.md`** — next-step hardening

`review_agent_prompt_refinement.md` is related infrastructure, while `idempotent-initialization-as-a-hardening-pattern.md` and `prefer-structured-state-over-brittle-text-heuristics.md` capture the two broader design principles that unify the cluster.