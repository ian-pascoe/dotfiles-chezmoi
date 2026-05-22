---
children_hash: 5c6e4993cbf6b0ee3090c98d5d62851d25aa4f53d792ddb02300c3cf25ac65e3
compression_ratio: 0.6883356385431074
condensation_order: 2
covers: [idempotent-initialization-as-a-hardening-pattern.md, opencode/_index.md, prefer-structured-state-over-brittle-text-heuristics.md]
covers_token_total: 2169
summary_level: d2
token_count: 1493
type: summary
---
# D2 Structural Summary

## Core pattern across the entries
The knowledge set converges on two recurring design principles:

- **Idempotent, resilient initialization** for startup and bootstrap paths.
- **Structured state over brittle text heuristics** for serialization, verification, and recovery.

Both principles are applied to reduce failure modes in repeated execution paths and to make behavior easier to validate and recover.

## 1) Hardening repeated startup and bootstrap paths
See **idempotent-initialization-as-a-hardening-pattern.md** for the cross-domain pattern.

- The **dot_config / zsh / Starship** fix makes shell initialization safe to source multiple times by preventing recursive widget wrapping and adding recovery for shells already stuck in the bad state.
- The **architecture / Byterover plugin** keeps `.brv` bootstrap behavior stable across repeated transform/persist cycles and avoids fragile readiness gating in paths that must remain durable.
- A key distinction is preserved: **`brvBridge.ready()` remains relevant for recall**, while persist/curation paths no longer depend on readiness checks.

## 2) OpenCode / Byterover workflow structure
See **opencode/_index.md** for the main topic summary and drill-down map.

### Goal/workflow design
See **review_of_codex_style_goal_plan.md**.

- Recommends a **command-first** goal workflow instead of a non-trivial inline agent in `opencode.jsonc`.
- Treats **pause / resume / clear** as prompt-driven controls rather than true background lifecycle management.
- Highlights **`progress.md` collision risk** and requires **OpenCode JSONC/schema validation** plus restart/load verification.
- Preserves a lifecycle centered on:
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
- Curation is bounded to the **current turn**, using a **recent recall window** only.
- The recall window is explicitly limited to **up to 3 user turns or 4096 characters**.
- The recommended workflow is:
  - recon
  - extract
  - curate
  - verify
- Verification should use **applied file paths**, not rereading files.

### Implementation notes and supporting fixes
See the following entries for specific hardening decisions:

- **byterover_plugin_curation_and_recall.md**
  - Prefers **structured JSON serialization**.
  - Avoids reasoning text in serialized output.
  - Truncates tool output where needed.
  - Includes the latest user message in retained context.
  - Filters empty input.
  - Adds bridge readiness checks and bridge logging.
  - Notes background curation failures and a dependency vulnerability.
- **byterover_recall_window_update.md**
  - Confirms bounded recall behavior with the **3-turn / 4096-character** limits.
  - Preserves **main-text-only serialization**.
- **recall_and_curation_improvements.md**
  - Suggests a **best-effort recall timeout**.
  - Renames the curation prompt label to **Conversation**.
  - Optionally logs recall window size.
  - Considers idle deduplication and oversize first-message handling.
- **neovim_ssh_clipboard_fix.md**
  - Forces **OSC52** clipboard provider for SSH sessions.
  - Enables **`unnamedplus`** so yanks route through the terminal/system clipboard.
  - Depends on terminal OSC52 support and was startup-verified.
- **package_manifest_sync_workflow.md**
  - Adds `dot_local/bin/executable_sync-package-manifests`.
  - Updates `dot_local/bin/executable_upgrade-all` to sync before `dotfiles pull`.
  - Validates exported package manifests against installed state.
  - Explicitly avoids `run*once*_` and `run*onchange*_` hooks.
- **retry_plugin_backoff.md**
  - Adds **exponential backoff with full jitter**.
  - Tracks retries **per session**.
  - Resets retry state on **non-overloaded** API errors.
  - Verification passed format/lint; typecheck was blocked by missing `tsc`.

### Topic framing
See **context.md**.

- Frames the OpenCode topic as review feedback on adding **Codex-style goals** to a **chezmoi-managed OpenCode configuration**.
- Key concepts include:
  - command-first goal workflow
  - inline agent risk
  - foreground vs background control
  - progress file collision risk
  - config validation

## 3) Structural principle: prefer structured state over brittle heuristics
See **prefer-structured-state-over-brittle-text-heuristics.md**.

- The project repeatedly replaces delimiter-heavy or ad hoc checks with **structured signals**.
- The Byterover plugin moved to **structured JSON serialization** instead of pseudo-XML delimiters.
- Serialization uses **role-labeled parts** and omits reasoning content.
- Verification relies on explicit metadata such as **`result.applied[].filePath`**, not on rereading files.

## Drill-down reference
- **Idempotent initialization:** `idempotent-initialization-as-a-hardening-pattern.md`
- **OpenCode topic overview:** `opencode/_index.md`
- **Goal workflow design:** `review_of_codex_style_goal_plan.md`
- **Recall/curation pipeline:** `byterover_context_engine_ideas.md`, `byterover_plugin_curation_and_recall.md`
- **Recall bounds:** `byterover_recall_window_update.md`
- **Workflow improvements:** `recall_and_curation_improvements.md`
- **Clipboard fix:** `neovim_ssh_clipboard_fix.md`
- **Manifest sync workflow:** `package_manifest_sync_workflow.md`
- **Retry/backoff hardening:** `retry_plugin_backoff.md`
- **Structured-state principle:** `prefer-structured-state-over-brittle-text-heuristics.md`