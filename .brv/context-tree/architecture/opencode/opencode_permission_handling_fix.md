---
title: Opencode Permission Handling Fix
summary: The opencode plugin now routes outside-worktree paths through external_directory permission checks, treats non-throwing context.ask as allow, keeps explicit deny objects fail-closed, and applies the same behavior to edit permission checks; verified by test, typecheck, lint, and format checks.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T12:05:04.653Z'
updatedAt: '2026-05-22T12:05:04.653Z'
---
## Reason
Preserve the applied live fix for external directory and edit permission handling in the opencode plugin

## Raw Concept
**Task:**
Document the opencode plugin permission-handling fix after the user applied and restarted opencode

**Changes:**
- Fixed permission handling so external directories go through context.ask instead of being hard-denied
- Adjusted allow semantics to match live OpenCode behavior for non-throwing context.ask results
- Applied the same non-throwing allow behavior to edit permission checks

**Files:**
- dot_config/opencode/plugins/ast-grep/index.ts
- dot_config/opencode/plugins/ast-grep/index.test.ts

**Flow:**
outside-worktree path -> external_directory permission check -> context.ask -> non-throwing allow or explicit deny -> proceed or fail closed

**Timestamp:** 2026-05-22T12:04:38.395Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The fix lives in the opencode plugin permission path and affects both search and edit flows. It replaces a hard-deny shortcut for external paths with a permission request and aligns the runtime interpretation of context.ask with live OpenCode behavior.

### Dependencies
Depends on OpenCode live plugin semantics, especially how context.ask resolves on allow versus deny. Verification used workspace-level test, typecheck, lint, and format checks.

### Highlights
The main outcome is that absolute paths under ~/.config/opencode should now ask for external_directory permission rather than failing immediately. The plugin now treats a non-throwing permission request as allowed, which fixes false denials in apply flows too.

## Facts
- **external_directory_permission_flow**: Outside-worktree paths now call context.ask for external_directory instead of hard-denying. [project]
- **context_ask_allow_semantics**: Non-throwing context.ask is treated as allow in live OpenCode behavior. [project]
- **deny_semantics**: Explicit deny objects still fail closed. [project]
- **edit_permission_flow**: The same non-throwing allow behavior also applies to edit permission checks. [project]
- **verification_commands**: The fix was verified with npm test, npm run typecheck, npm run lint, and npm run format:check in the dot_config/opencode workspace. [project]
