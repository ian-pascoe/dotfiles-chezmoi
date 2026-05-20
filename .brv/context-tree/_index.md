---
children_hash: bfbe1964ca2fcf457803f1b4b3e3ccef0e969153a11869f1c604ccd6916f1e61
compression_ratio: 0.6789598108747045
condensation_order: 3
covers: [architecture/_index.md, dot_config/_index.md, facts/_index.md]
covers_token_total: 2115
summary_level: d3
token_count: 1436
type: summary
---
## d3 Structural Summary

This cluster consolidates a single reliability strategy across architecture, shell config, and facts: **make state explicit, processing bounded, and initialization idempotent**. The recurring emphasis is on replay-safe behavior, structured verification, and avoiding brittle text heuristics.

### Core architectural direction
- **`architecture/_index.md`** frames the main design thread: explicit state, bounded best-effort processing, and evidence-driven verification.
- **`facts/_index.md`** reinforces the same operational principle at the workflow level: prefer bounded, noise-aware processing over exhaustive completeness.
- **`dot_config/_index.md`** applies the pattern in shell startup, where repeated sourcing must not create recursive or corrupted state.

### Memory, recall, and curation hardening
The memory pipeline is the most developed thread in `architecture/_index.md`:
- Curate only lasting-value content.
- Strip metadata, wrapper tags, and tool noise.
- Prefer the latest cleaned user query for recall.
- Keep recall best-effort with timeout protection.
- Use structured JSON serialization instead of delimiter-heavy pseudo-XML.
- Exclude reasoning content from durable memory ingestion.
- Preserve `.brv` bootstrap behavior.
- Use `brvBridge.ready()` for recall, but remove readiness checks from persist/curation paths.

#### Drill-down sequence
1. **`byterover_context_engine_ideas.md`** — conceptual memory rules and recall philosophy
2. **`byterover_plugin_curation_and_recall.md`** — plugin behavior in `dot_config/opencode/plugins/byterover.ts`
3. **`byterover_recall_window_update.md`** — bounded recall window: 3 recent user turns and 4096 formatted characters; curation stays limited to the current completed turn
4. **`recall_and_curation_improvements.md`** — follow-up hardening ideas such as AbortController timeouts, deduping repeated idle curation, and handling short but meaningful replies

### Review workflow refinement
- **`review_agent_prompt_refinement.md`** is adjacent infrastructure work, but distinct from memory handling.
- It updates `dot_config/opencode/prompt/review.md` and `dot_config/opencode/opencode.jsonc`.
- The main shift is separation of **review** from **solving**, with **evidence-based findings** and severity ordering.
- Output is constrained to concise sections: **Correct, Fixed, Blocker, Note**.
- Verification passed for JSONC parsing, markdown structure, and `git diff --check`; `markdownlint-cli2` was unavailable.

### Structured state over brittle heuristics
- **`prefer-structured-state-over-brittle-text-heuristics.md`** generalizes the same design preference:
  - Replace brittle delimiter parsing with **structured JSON**.
  - Use explicit role-labeled parts and cleaned turn extraction.
  - Skip reasoning content and cap/truncate tool output.
  - Verify curated results through explicit metadata such as `result.applied[].filePath`, not by rereading files.

### Startup hardening and idempotence
- **`idempotent-initialization-as-a-hardening-pattern.md`** connects shell and plugin behavior through the same reliability model:
  - Initialization must be **idempotent**.
  - Systems should recover from partial or corrupted prior state.
- In `dot_config/_index.md`, **`starship_escape_recursion_fix.md`** is the concrete example:
  - a zsh/Starship bug where `Escape` triggered recursive `zle-keymap-select` wrapping and eventually `FUNCNEST`
  - fix uses an idempotent Starship init block in `dot_zshrc`
  - recovery path works even when the shell is already in a broken recursive-wrapper state
  - `prompt_starship_precmd` serves as the sentinel for prior initialization
  - verification included `zsh -n dot_zshrc` and sourcing `dot_zshrc` twice

### Adjacent reliability notes
These entries sit near the same reliability theme:
- **`retry_plugin_backoff.md`** — overloaded API retries use exponential backoff with full jitter and per-session tracking
- **`package_manifest_sync_workflow.md`** — manifest refresh is automated via `dot_local/bin/executable_sync-package-manifests` and `dot_local/bin/executable_upgrade-all`
- **`neovim_ssh_clipboard_fix.md`** — SSH clipboard reliability is restored by forcing OSC52 and `clipboard=unnamedplus`

### Facts and workflow conventions
- **`bounded-best-effort-processing-over-perfect-completeness.md`** captures the overarching rule: memory recall, curation, and verification should remain fail-safe, time-bounded, and noise-aware.
- **`project/_index.md`** is the canonical workflow reference for curation:
  - recon → extraction/curation → verification
  - single-pass mode for small contexts after recon
  - chunked mode as fallback for larger inputs using `tools.curation.mapExtract()` plus dedup/grouping
  - verification should use applied curate results rather than rereading source material
- Shared constraints include:
  - bounded recent-turn recall
  - avoid noisy or empty inputs
  - **UPSERT** as the preferred curation operation
  - `mapExtract` requires `taskId` as a bare variable
  - surrounding `code_exec` needs `timeout: 300000`
  - do not print raw context during curation
  - preserve facts, temporal markers, and file-path evidence

### Main drill-down map
- **Architecture and memory hardening:** `architecture/_index.md`
- **Shell startup safety:** `dot_config/_index.md`
- **Bounded processing and workflow rules:** `facts/_index.md`
- **Deepest memory thread:** `byterover_context_engine_ideas.md` → `byterover_plugin_curation_and_recall.md` → `byterover_recall_window_update.md` → `recall_and_curation_improvements.md`
- **Broader design principles:** `idempotent-initialization-as-a-hardening-pattern.md` and `prefer-structured-state-over-brittle-text-heuristics.md`