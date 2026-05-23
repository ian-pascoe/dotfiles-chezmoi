---
children_hash: 0a045588577fc71f46518bd70adee07961bfd3d4ce2ad93ba71aafcdad2ebec3
compression_ratio: 0.5743308610125766
condensation_order: 3
covers: [architecture/_index.md, dot_config/_index.md, facts/_index.md]
covers_token_total: 3101
summary_level: d3
token_count: 1781
type: summary
---
# d3 Structural Summary

This level aggregates three major knowledge clusters: **architecture**, **dot_config**, and **facts**. Together they describe a consistent engineering style built around **idempotent startup**, **structured state**, and **bounded, verifiable curation/recall**.

## 1) Architecture: hardening patterns and OpenCode/Byterover workflow
Drill down: `architecture/_index.md`

The architecture cluster combines cross-cutting reliability patterns with a larger set of OpenCode/Byterover implementation notes.

### Core patterns
- **Idempotent initialization as a hardening strategy**
  - See `idempotent-initialization-as-a-hardening-pattern.md`
  - See `idempotent-initialization-is-the-shared-hardening-strategy-for-repeated-startup-paths.md`
  - Applies across repeated startup paths, shell sourcing, and plugin bootstrap/recovery.
- **Prefer structured state over brittle text heuristics**
  - See `prefer-structured-state-over-brittle-text-heuristics.md`
  - Replaces delimiter-heavy parsing with explicit JSON/metadata and machine-readable verification.

### OpenCode / Byterover themes
Drill down into `opencode/_index.md` for the detailed cluster:
- **Plugin capability expansion**
  - `lsp_tools_plan.md`: lightweight JSON-RPC LSP client; preview-first; permission-gated writes; MVP covers diagnostics, formatting, organize imports, fix-all.
  - `plugin_ideas_for_write_and_diagnostics_capability.md`: write-capable semantic edits and diagnostics aggregation are key missing capabilities.
  - `opencode_permission_handling_fix.md`: external paths use `context.ask({ permission: "external_directory" })`; non-throwing asks count as allow; explicit deny fails closed.
  - `retry_plugin_backoff.md`: session-scoped retries with exponential backoff and full jitter.

- **Recall and curation workflow**
  - `recall_window_and_curation_pipeline.md`: canonical flow is recon → extract → curate → verify; recall is bounded; current-turn-only curation; verification uses `result.applied[].filePath`.
  - `byterover_plugin_curation_and_recall.md`: structured JSON serialization, omit reasoning, truncate tool output, include latest user message, preserve bridge logging/validation details.
  - `byterover_recall_window_update.md`: preserves bounded recall-window policy and current-turn-only curation scope.
  - `byterover_context_engine_ideas.md`: selective curation, noise filtering, metadata stripping, assistant-tag removal, timeout-protected best-effort recall.
  - `recall_and_curation_improvements.md`: best-effort recall timeout, prompt-label cleanup, idle deduplication, oversize first-message handling.

- **Workflow review and prompt design**
  - `review_of_codex_style_goal_plan.md` and `context.md`: prefer a command-first design over an inline background agent; use JSONC/schema validation and restart/load verification.
  - `review_agent_prompt_refinement.md`: evidence-based review posture, severity ordering, no-edit rule, strict output constraints.

### Overall architecture stance
The collection converges on a single operating style:
- idempotent bootstrap over one-shot init
- structured metadata over heuristic parsing
- bounded recall over unbounded history
- preview-first and permission-aware actions over destructive automation
- direct verification over assumed success

## 2) dot_config: zsh prompt safety and Starship recursion fix
Drill down: `dot_config/_index.md`

This cluster is narrowly focused on one shell integration issue:
- `starship_escape_recursion_fix.md` documents a zsh/Starship bug where pressing `Escape` caused recursive wrapping of `zle-keymap-select` until `FUNCNEST` was reached.
- The fix makes the Starship init block in `dot_zshrc` **idempotent**, so it runs only once even if sourced multiple times.
- It also includes recovery for sessions already stuck in the broken recursive-wrapper state.
- `prompt_starship_precmd` is used as the sentinel to detect prior initialization.
- Verification included both:
  - `zsh -n dot_zshrc`
  - sourcing `dot_zshrc` twice to confirm nonrecursive behavior

### Key pattern
- **Idempotent initialization with recovery for already-corrupted state**
- Preserves normal zsh prompt behavior while preventing Starship from wrapping its own widget.

## 3) Facts: durable operational rules for bounded curation
Drill down: `facts/_index.md`

The facts domain stores durable process knowledge rather than product implementation details. Its purpose is to preserve reusable operational guidance for context engineering.

### Main entry points
- `bounded-best-effort-processing-over-perfect-completeness.md`
  - Central operating principle: prefer **bounded, best-effort processing** with explicit verification over exhaustive reprocessing.
  - Recall is limited to a recent window with timeout protection.
  - Curation avoids noisy or empty inputs and uses single-pass handling when possible.
  - Verification is done via **applied file paths**, not rereading files.

- `context.md`
  - Defines the `facts` domain as the home for durable process rules and operational curation guidance.
  - Excludes product docs, implementation source code, and unrelated notes.

### Conventions and session rules
Drill down into `conventions/_index.md` and `rlm_curation_session_constraints.md`:
- canonical workflow is:
  - precomputed recon
  - direct extraction or curation
  - verification via `result.applied[].filePath`
- if recon is already available, do not rerun it
- for chunked extraction, use `tools.curation.mapExtract()`
- do not print raw context
- do not verify by rereading files
- pass `taskId` as a bare variable
- use a `300000 ms` timeout for code execution containing `mapExtract`

### Project-level workflow baseline
Drill down into `project/_index.md` and related entries:
- documents the canonical RLM curation workflow and repository baseline
- standard flow:
  - recon
  - choose single-pass or chunked extraction
  - curate with UPSERT
  - verify via curate results
- environment baseline:
  - working repo is the chezmoi repo at `/home/ianpascoe/.local/share/chezmoi`
  - Linux, Node.js v26.2.0
  - semantic tree under `.brv/context-tree/`
  - hierarchy is domain/topic/subtopic with max depth 2
  - `UPSERT` is preferred
- repo verification baseline:
  - `npm test` maps to `vitest run`
  - one recorded run passed 7 test files and 36 tests

### Cross-entry pattern
Across the facts cluster, the recurring rule is:
- keep processing bounded
- use structured extraction when needed
- verify through machine-readable results
- preserve durable knowledge in context, not chat memory

## 4) Unifying theme across all three clusters
The whole set points to the same engineering philosophy:
- **idempotent startup**
- **structured state**
- **bounded, verifiable processing**
- **permission-aware actions**
- **durable knowledge captured as reusable context**

### Drill-down map
- `architecture/_index.md` for hardening patterns and OpenCode/Byterover workflow
- `dot_config/_index.md` for zsh/Starship initialization safety
- `facts/_index.md` for curation rules, workflow constraints, and operational baselines