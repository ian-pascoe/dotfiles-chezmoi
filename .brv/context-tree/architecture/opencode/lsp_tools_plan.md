---
title: LSP Tools Plan
summary: Plan for a local OpenCode plugin that adds preview-first, permission-gated LSP diagnostics, code actions, rename, formatting, organize imports, and fix-all tools using a standalone JSON-RPC LSP client.
tags: []
related: [architecture/opencode/plugin_ideas_for_write_and_diagnostics_capability.md, architecture/opencode/opencode_permission_handling_fix.md, architecture/opencode/recall_window_and_curation_pipeline.md, architecture/opencode/byterover_plugin_curation_and_recall.md]
keywords: []
createdAt: '2026-05-22T12:14:51.002Z'
updatedAt: '2026-05-22T12:14:51.002Z'
---
## Reason
Capture the implementation plan for write-capable LSP tools in the OpenCode plugin

## Raw Concept
**Task:**
Document the implementation plan for OpenCode LSP tools

**Changes:**
- Defined the plugin architecture, tool set, safety model, and implementation tasks
- Chose a standalone lightweight LSP client instead of OpenCode internals
- Scoped the MVP around Biome-based tooling first

**Files:**
- dot_config/opencode/package.json

**Flow:**
inspect plugin/test patterns -> define tool set -> add transport/client -> implement preview/apply edits -> verify with tests and smoke tests

**Timestamp:** 2026-05-22T12:14:30.691Z

## Narrative
### Structure
The plan breaks the work into plugin skeleton, permission helpers, workspace edit handling, JSON-RPC transport, LSP client management, diagnostics, code actions, rename, formatting, wrappers, and verification.

### Dependencies
Depends on the existing lsp config from opencode.jsonc and the local OpenCode plugin API; no new runtime dependencies are planned.

### Highlights
The design emphasizes preview-first writes, permission gating, and testability via a standalone LSP client. The MVP centers on Biome-backed features first, then expands to semantic rename support later.

### Rules
All writes require apply: true. All writes preview first. All writes call context.ask({ type: "edit", paths }). External paths call context.ask({ permission: "external_directory", patterns: [...] }). Reject edits outside approved paths. Reject unsupported resource operations in WorkspaceEdit at first: create, rename, delete.

### Examples
Smoke tests include lsp_diagnostics on a known .ts or .jsonc file, lsp_code_actions on a Biome-fixable issue, lsp_format_document with apply: false, lsp_organize_imports with apply: false, and lsp_fix_all on a disposable temp file.

## Facts
- **lsp_tools_scope**: The plugin should provide write-capable LSP tools: diagnostics, rename, code actions, organize imports, fix-all, and formatting. [project]
- **lsp_client_architecture**: The plugin should run its own lightweight LSP client using the existing lsp config from opencode.jsonc. [project]
- **lsp_dependency_choice**: The plan explicitly avoids depending on OpenCode’s built-in read-only LSP tool internals. [project]
- **json_rpc_transport**: The implementation should use minimal JSON-RPC over child process stdio with Node built-ins rather than new runtime dependencies. [project]
- **write_safety_model**: All writes require apply: true and preview-first behavior with permission-gated edits. [convention]
- **path_permission_rules**: External paths must request external_directory permission and edits outside approved paths must be rejected. [convention]
- **workspace_edit_limits**: Resource operations in WorkspaceEdit are rejected for the MVP. [project]
- **code_action_limits**: Command-only code actions are listed but not executed initially. [project]
- **mvp_focus**: The MVP should focus on Biome first for diagnostics, formatting, organize imports, and fix-all. [project]
- **rename_dependency_future**: Semantic rename may require adding a TypeScript language server later. [project]
- **verification_plan**: Planned verification includes tests for the plugin, typecheck, lint, format check, and smoke testing after chezmoi apply and OpenCode restart. [project]
- **plan_file**: The target plan file was identified as docs/superpowers/plans/2026-05-22-opencode-lsp-tools.md. [project]
