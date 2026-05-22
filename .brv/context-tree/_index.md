---
children_hash: 36e236ccbed20e284f8d287828a9be0a04f180601964736505fe6a0c096fa7a5
compression_ratio: 0.6269349845201239
condensation_order: 3
covers: [architecture/_index.md, dot_config/_index.md, facts/_index.md]
covers_token_total: 2584
summary_level: d3
token_count: 1620
type: summary
---
# D3 Structural Summary

## Architecture domain
The architecture domain is organized around two durable principles:

- **Idempotent, resilient initialization** for repeated startup/bootstrap paths.
- **Structured state over brittle text heuristics** for serialization, validation, and verification.

These principles recur across shell startup fixes, plugin curation/recall workflows, and manifest synchronization. The architecture summaries emphasize reducing failure modes in repeated execution paths and relying on explicit state rather than delimiter-heavy or reread-based checks.

### Key drill-down topics
- **idempotent-initialization-as-a-hardening-pattern.md** — overarching hardening pattern for repeated execution and recovery
- **opencode/_index.md** — main OpenCode / Byterover topic overview
- **prefer-structured-state-over-brittle-text-heuristics.md** — structured-state principle and verification model

## OpenCode / Byterover workflow cluster
The OpenCode-related entries describe a command-first goal workflow and a constrained memory/curation pipeline that is deliberately non-exhaustive.

### Goal workflow design
See **review_of_codex_style_goal_plan.md**.

- Recommends a **command-first** goal workflow instead of embedding a non-trivial inline agent in `opencode.jsonc`.
- Treats **pause / resume / clear** as prompt-driven controls rather than true background lifecycle management.
- Highlights **`progress.md` collision risk** and requires **OpenCode JSONC/schema validation** plus restart/load verification.
- The lifecycle centers on:
  - goal objective
  - status / pause / resume / clear prompts
  - checkpoints and validation
  - progress log updates
  - stop on done, blocker, pause, or clear
- Plugin support is deferred because it adds complexity without guaranteeing true background execution.

### Recall and curation pipeline
See **byterover_context_engine_ideas.md**, **byterover_plugin_curation_and_recall.md**, **byterover_recall_window_update.md**, and **recall_and_curation_improvements.md**.

- The system favors **selective curation** over broad ingestion.
- Recall is **best-effort**, guarded by timeout/abort safeguards, and must not block the agent.
- Curation is bounded to the **current turn**, using a recent recall window only.
- Recall window limits are explicitly **up to 3 user turns or 4096 characters**.
- Recommended workflow:
  - recon
  - extract
  - curate
  - verify
- Verification should use **applied file paths**, not rereading files.

### Supporting implementation decisions
- **byterover_plugin_curation_and_recall.md**
  - Structured JSON serialization
  - No reasoning text in serialized output
  - Truncated tool output where needed
  - Latest user message retained in context
  - Empty input filtered
  - Bridge readiness checks and bridge logging
  - Notes background curation failures and a dependency vulnerability
- **byterover_recall_window_update.md**
  - Confirms bounded recall behavior with the **3-turn / 4096-character** limits
  - Preserves **main-text-only serialization**
- **recall_and_curation_improvements.md**
  - Best-effort recall timeout
  - Renamed curation prompt label to **Conversation**
  - Optional recall window size logging
  - Idle deduplication and oversize first-message handling
- **neovim_ssh_clipboard_fix.md**
  - Forces **OSC52** clipboard provider for SSH sessions
  - Enables **`unnamedplus`**
  - Depends on terminal OSC52 support and was startup-verified
- **package_manifest_sync_workflow.md**
  - Adds `dot_local/bin/executable_sync-package-manifests`
  - Updates `dot_local/bin/executable_upgrade-all` to sync before `dotfiles pull`
  - Validates exported package manifests against installed state
  - Explicitly avoids `run*once*_` and `run*onchange*_` hooks
- **retry_plugin_backoff.md**
  - Adds **exponential backoff with full jitter**
  - Tracks retries **per session**
  - Resets retry state on **non-overloaded** API errors
  - Verification passed format/lint; typecheck was blocked by missing `tsc`

## dot_config / zsh
The zsh configuration entry documents a shell startup hardening fix centered on idempotent prompt initialization.

### starship_escape_recursion_fix.md
- Documents a zsh/Starship bug where pressing `Escape` caused recursive wrapping of `zle-keymap-select`, eventually hitting `FUNCNEST`.
- The fix makes the Starship init block in `dot_zshrc` **idempotent** so it initializes only once, even if sourced multiple times.
- Includes a recovery path for shells already stuck in the recursive-wrapper state.
- Uses `prompt_starship_precmd` as the sentinel for prior initialization.
- Verification covered both `zsh -n dot_zshrc` parse safety and sourcing `dot_zshrc` twice to confirm nonrecursive behavior.

### Pattern connection
This entry is the shell-specific example of the broader architecture pattern: **idempotent initialization with recovery for already-corrupted state**.

## Facts domain
The facts domain captures the project’s operational principle: **bounded, best-effort processing over perfect completeness**.

### bounded-best-effort-processing-over-perfect-completeness.md
- Frames memory recall, curation workflow, and verification around bounded execution rather than exhaustive processing.
- Emphasizes:
  - bounded recall with timeout protection
  - best-effort curation that avoids noisy or empty inputs
  - single-pass preference when recon is already available or context is small
  - verification via curate output and applied file paths

### project/_index.md
- Describes the canonical curation workflow:
  - recon-first handling
  - single-pass vs chunked processing
  - UPSERT as default
  - explicit status verification
- Serves as the concrete operationalization of the bounded-best-effort principle.

### Structural relationships
- The bounded-best-effort principle explains the workflow behavior in **project/_index.md**.
- The project workflow is the concrete sequence:
  - **recon -> extract (single-pass or chunked) -> curate -> verify -> report status**
- The summary set positions these rules as the reference point for future workflow updates.

### Key constraints preserved
- **UPSERT is the default** for curation updates.
- **Do not print raw context**.
- **Do not ask for confirmation**; execute immediately.
- **Check `result.summary.failed` explicitly** and retry if needed.
- **Use file paths, not rereads, for verification**.
- **Use bounded execution windows** rather than exhaustive processing.