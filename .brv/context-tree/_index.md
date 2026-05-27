---
children_hash: d4f8876e7966cf87807db8fdd30c6bcd86deb0b5f8c3beabb54cd60e738e5d44
compression_ratio: 0.4046153846153846
condensation_order: 3
covers: [architecture/_index.md, dot_config/_index.md, facts/_index.md]
covers_token_total: 2600
summary_level: d3
token_count: 1052
type: summary
---
## d3 Structural Summary

This layer preserves the repo’s core operating patterns across startup hardening, structured-state verification, and durable workflow knowledge.

### 1) Startup hardening: repeated init must be safe
Key entries:
- `architecture/_index.md`
- `dot_config/_index.md`

Shared pattern:
- Startup/bootstrap logic is designed to be **idempotent** and safe to rerun.
- Recovery must handle **partially corrupted or already-broken state**, not just clean startup.
- The same reliability strategy appears in both shell config and plugin/runtime bootstrap contexts.

Drill-down entries:
- `idempotent-startup-is-the-shared-hardening-pattern.md`
- `idempotent-initialization-is-the-shared-hardening-strategy-for-repeated-startup-.md`
- `idempotent-initialization-as-a-hardening-pattern.md`
- `starship_escape_recursion_fix.md`

Notable details:
- In zsh/Starship startup, `prompt_starship_precmd` is used as the sentinel to detect prior initialization.
- The fix prevents recursive widget wrapping and avoids `FUNCNEST`.
- Verification included both parse safety and sourcing `dot_zshrc` twice.
- In the architecture notes, repeated startup and bootstrap cycles are treated as normal failure-prone conditions, so durable init paths must tolerate reruns.

### 2) Structured state beats brittle parsing
Key entries:
- `architecture/_index.md`

Shared pattern:
- Replace delimiter-heavy or heuristic parsing with **explicit structured state**.
- Prefer machine-readable metadata and sentinels over rereading or interpreting raw text.

Drill-down entries:
- `structured-state-beats-brittle-text-parsing.md`
- `prefer-structured-state-over-brittle-text-heuristics.md`

Notable details:
- The Byterover plugin moved from pseudo-XML/delimiter-heavy handling toward **structured JSON serialization**.
- Role-labeled parts are preserved while reasoning content is skipped.
- Verification uses **`result.applied[].filePath`** instead of rereading files.
- This same principle appears in zsh startup via the sentinel-based guard rather than text matching.

### 3) Durable workflow knowledge belongs in curated context, not chat
Key entries:
- `facts/_index.md`

Shared pattern:
- Operational knowledge is stored as **durable context** in the tree, not left in transient conversation state.
- The canonical process is consistently **recon → extract/curate → verify**.
- Workflow is bounded and best-effort rather than exhaustive.

Drill-down entries:
- `bounded-best-effort-processing-over-perfect-completeness.md`
- `bounded-operations-are-preferred-over-exhaustive-retries-or-rereads.md`
- `canonical-workflow-knowledge-is-preserved-as-durable-context-not-chat-state.md`
- `conventions/context.md`
- `facts/context.md`
- `project/_index.md`

Notable details:
- The `facts` domain stores durable process rules, constraints, and operating conventions.
- The `conventions` summary emphasizes:
  - no raw context output
  - no unnecessary recon reruns
  - chunked extraction only when needed
  - verification from curated results
- The broader operating rule is to prefer **single-pass, bounded execution** and verify from canonical outputs instead of chat memory.

### 4) Repo-level workflow and environment reinforce the same model
Key entries:
- `facts/_index.md`

Shared pattern:
- Project work uses the same bounded, verify-from-results discipline.
- Context tree structure is fixed as **domain → topic → subtopic**, with max depth 2.

Drill-down entries:
- `working_repository_environment.md`
- `repo_test_verification.md`
- `opencode_ast_grep_and_lsp_plugin_implementation.md`

Notable details:
- The workspace is the chezmoi repo at `/home/ianpascoe/.local/share/chezmoi`.
- Environment baseline: Linux, Node.js v26.2.0.
- Verification is anchored in concrete signals like `npm test`, `vitest run`, `result.summary.failed`, and `result.applied[].filePath`.

### Combined takeaway
Across these entries, the repository consistently favors:
- **idempotent initialization** for repeatable startup paths,
- **structured metadata and sentinels** over brittle text parsing,
- **durable curated context** over chat memory,
- and **bounded verification from canonical results** rather than exhaustive reruns.