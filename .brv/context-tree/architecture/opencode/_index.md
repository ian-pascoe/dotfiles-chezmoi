---
children_hash: b230b71719b40fd7c9ae6f16cb08721d272791f48fd8ecf8ca442c436bc3f6c0
compression_ratio: 0.3323901712583768
condensation_order: 1
covers: [byterover_context_engine_ideas.md, byterover_plugin_curation_and_recall.md, byterover_recall_window_update.md, context.md, lsp_tools_plan.md, neovim_ssh_clipboard_fix.md, opencode_permission_handling_fix.md, package_manifest_sync_workflow.md, plugin_ideas_for_write_and_diagnostics_capability.md, recall_and_curation_improvements.md, recall_window_and_curation_pipeline.md, retry_plugin_backoff.md, review_agent_prompt_refinement.md, review_of_codex_style_goal_plan.md]
covers_token_total: 6715
summary_level: d1
token_count: 2232
type: summary
---
# OpenCode / Byterover Structural Summary

This d1 set captures a cluster of durable OpenCode and Byterover notes centered on plugin design, curation workflow, and recovery/verification patterns. The collection is split between live implementation notes, review guidance, and consolidation records that preserve canonical content while removing duplicate sync-conflict copies.

## Core architectural themes

- **Plugin capability expansion**: Several entries focus on extending OpenCode with safer, more capable tooling:
  - **`lsp_tools_plan.md`** defines a preview-first, permission-gated LSP plugin built around a standalone JSON-RPC client.
  - **`plugin_ideas_for_write_and_diagnostics_capability.md`** prioritizes write-capable LSP refactors and a diagnostics aggregator as the highest-value missing capabilities.
  - **`opencode_permission_handling_fix.md`** records the live fix that routes external paths through `external_directory` permission checks and aligns allow/deny semantics with OpenCode behavior.
  - **`retry_plugin_backoff.md`** documents session-scoped retry handling with exponential backoff and full jitter.

- **Curation and recall workflow**: Multiple notes converge on a bounded, best-effort recall model for durable knowledge capture:
  - **`recall_window_and_curation_pipeline.md`** is the clearest workflow reference: recon → extract → curate → verify.
  - **`byterover_plugin_curation_and_recall.md`** and **`byterover_recall_window_update.md`** preserve canonical notes on structured serialization, recall-window limits, and background curation behavior.
  - **`recall_and_curation_improvements.md`** preserves recommendations for safer recall handling and prompt-label cleanup.
  - **`byterover_context_engine_ideas.md`** retains higher-level ideas about selective curation, noise filtering, metadata stripping, assistant-tag removal, and timeout-protected best-effort recall.

- **OpenCode review and workflow constraints**:
  - **`review_of_codex_style_goal_plan.md`** critiques a Codex-style goal workflow and recommends a command-first design rather than an inline background agent.
  - **`context.md`** frames the broader topic as review feedback on adding Codex-style goals to a chezmoi-managed OpenCode configuration.

## Entry-by-entry drill-down

### `lsp_tools_plan.md`
Defines the implementation plan for write-capable LSP tools in the OpenCode plugin. Key decisions:
- Use a standalone lightweight LSP client, not OpenCode internals.
- Keep writes preview-first and permission-gated.
- MVP focuses on Biome-backed diagnostics, formatting, organize imports, and fix-all.
- Reject unsupported WorkspaceEdit resource operations initially.
- Verification includes tests, typecheck, lint, format check, and smoke tests after chezmoi apply and OpenCode restart.

### `plugin_ideas_for_write_and_diagnostics_capability.md`
Summarizes the highest-value plugin ideas:
- Write-capable LSP refactor tools with semantic edits.
- Diagnostics aggregation for normalized error reporting.
- Supporting ideas: semantic patch queue, test failure intelligence, repo command registry, dependency/API grounding.
- Related to the broader LSP tools plan and permission handling work.

### `opencode_permission_handling_fix.md`
Documents the applied fix for permission behavior:
- External directories now call `context.ask({ permission: "external_directory" })` instead of hard-denying.
- Non-throwing `context.ask` is treated as allow, matching live OpenCode semantics.
- Explicit deny objects still fail closed.
- The same behavior applies to edit permission checks.
- Verified with test, typecheck, lint, and format checks in the plugin workspace.

### `retry_plugin_backoff.md`
Captures retry behavior improvements:
- Exponential backoff with full jitter.
- Retry attempts tracked per session.
- Retry state reset on non-overloaded errors.
- Starts at 1 second and caps at 30 seconds.
- Verification notes: format and lint passed; typecheck was blocked by missing `tsc`.

### `package_manifest_sync_workflow.md`
Describes a manifest refresh workflow for chezmoi-managed dotfiles:
- Adds `sync-package-manifests` and makes `upgrade-all` invoke it before `dotfiles pull`.
- Refreshes package manifests from current installed state.
- Explicitly avoids run-once / run-onchange hooks.
- Verification confirmed export counts matched installed state across apt, npm, bun, pnpm, uv, cargo, and pipx.

### `neovim_ssh_clipboard_fix.md`
Records the SSH clipboard fix for Neovim:
- Forces OSC52 clipboard provider in SSH sessions.
- Enables `unnamedplus` so yanks route through terminal/system clipboard.
- Applies only in SSH sessions.
- Depends on terminal OSC52 support; paste/read may need terminal permission.
- Verified via formatting and SSH startup check.

### `recall_window_and_curation_pipeline.md`
The main workflow guidance for curation:
- Limit recall to the recent conversation window: up to 3 user turns or 4096 characters.
- Use best-effort recall with timeout/abort protection so the agent stays responsive.
- Curation stays current-turn only.
- Keep the prompt label as `Conversation` and inject recall later in system transform.
- Prefer recon before extraction for applicable contexts.
- Use single-pass processing for small contexts.
- Verify curation through `result.applied[].filePath`.

### `byterover_plugin_curation_and_recall.md`
A canonical consolidation note for plugin curation and recall:
- Preserve structured JSON serialization.
- Omit reasoning and truncate tool output.
- Include the latest user message.
- Filter empty input.
- Check bridge readiness and block persist completion checks as needed.
- Retain bridge logging, recall prompt cleanup, validation commands, and dependency vulnerability notes.
- Related to `lsp_tools_plan.md` and `recall_window_and_curation_pipeline.md`.

### `byterover_recall_window_update.md`
A canonical consolidation note for recall-window behavior:
- Preserve bounded recall-window behavior.
- Keep current-turn-only curation scope.
- Serialize main text only.
- Preserve verification results.
- Retain the 3-turn and 4096-character limits.

### `byterover_context_engine_ideas.md`
A canonical ideas note for the ByteRover context engine:
- Preserve selective curation and noise filtering.
- Strip metadata and assistant tags.
- Use best-effort recall with timeout protection.
- Keep the durable ideas from the canonical note; sync-conflict copies are duplicates only.

### `recall_and_curation_improvements.md`
A recommendations note for improving recall and curation:
- Add a best-effort recall timeout.
- Rename the curation prompt label to `Conversation`.
- Optionally log recall window size.
- Consider idle deduplication.
- Handle oversize first-message edge cases carefully.

### `review_of_codex_style_goal_plan.md`
The review outcome for a Codex-style goal workflow:
- Prefer a command-first goal flow.
- Avoid a non-trivial inline agent in `opencode.jsonc`.
- Treat pause/resume/clear as prompts, not real background control.
- Flag `progress.md` collision risk.
- Require OpenCode JSONC/schema validation plus restart/load verification.
- Plugin support is deferred because it adds complexity and does not ensure true background goal execution.

### `review_agent_prompt_refinement.md`
Preserves review-agent prompt refinements:
- Evidence-based review posture.
- Severity ordering.
- No-edit rule.
- Review output format.
- Verification outcomes and formatter-missing note.

## Consolidation and canonical-note pattern

Several entries are consolidation markers rather than standalone substantive notes:
- `byterover_context_engine_ideas.md`
- `byterover_plugin_curation_and_recall.md`
- `byterover_recall_window_update.md`
- `recall_and_curation_improvements.md`
- `review_agent_prompt_refinement.md`

These preserve the canonical note and explicitly state that sync-conflict copies add no unique durable information.

## Relationship map

- **LSP/plugin work**: `lsp_tools_plan.md` ↔ `plugin_ideas_for_write_and_diagnostics_capability.md` ↔ `opencode_permission_handling_fix.md`
- **Retry / manifest / clipboard hardening**: `retry_plugin_backoff.md`, `package_manifest_sync_workflow.md`, `neovim_ssh_clipboard_fix.md`
- **Recall/curation workflow**: `recall_window_and_curation_pipeline.md` ↔ `byterover_plugin_curation_and_recall.md` ↔ `byterover_recall_window_update.md` ↔ `recall_and_curation_improvements.md` ↔ `byterover_context_engine_ideas.md`
- **Workflow review / goal planning**: `context.md` ↔ `review_of_codex_style_goal_plan.md`

## High-level takeaway

The dominant pattern across these notes is a preference for minimal, verifiable, permission-aware automation:
- preview-first over destructive actions,
- bounded recall over expansive retrieval,
- current-turn or recent-window context over broad history,
- canonical notes over duplicate sync-conflict copies,
- and concrete verification over assumed success.