---
title: Starship Escape Recursion Fix
summary: Starship zsh init was made idempotent to prevent recursive zle-keymap-select wrapping on Escape; repair path added for already-broken shells.
tags: []
related:
  - architecture/opencode/neovim_ssh_clipboard_fix.md
keywords: []
createdAt: '2026-05-05T17:20:26.017Z'
updatedAt: '2026-05-05T17:20:26.017Z'
consolidated_at: '2026-05-06T09:48:36.940Z'
consolidated_from:
  - {date: '2026-05-06T09:48:36.940Z', path: dot_config/zsh/starship_escape_recursion_fix.abstract.md, reason: 'These three files describe the same Starship zsh Escape recursion fix. The .md file is the richest source with full front matter, raw concept, narrative, and facts; the abstract and overview are redundant summaries that repeat the same core details.'}
  - {date: '2026-05-06T09:48:36.940Z', path: dot_config/zsh/starship_escape_recursion_fix.overview.md, reason: 'These three files describe the same Starship zsh Escape recursion fix. The .md file is the richest source with full front matter, raw concept, narrative, and facts; the abstract and overview are redundant summaries that repeat the same core details.'}
---
## Reason
Document the idempotent Starship init fix for recursive zle-keymap-select wrapping

## Raw Concept
**Task:**
Fix recursive Starship zsh widget wrapping caused by Escape key handling

**Changes:**
- Made Starship init block idempotent
- Added repair for already-broken recursive wrapper state
- Verified parse safety and double-source behavior

**Files:**
- dot_zshrc

**Flow:**
source shell config -> init Starship once -> avoid wrapping own widget -> Escape works without recursion

**Timestamp:** 2026-05-05T17:20:11.841Z

**Author:** assistant

## Narrative
### Structure
The fix lives in dot_zshrc and guards Starship initialization so zle-keymap-select is not wrapped repeatedly. It also repairs shells that already reached the recursive wrapper state.

### Dependencies
Depends on Starship zsh integration and the prompt_starship_precmd sentinel for detecting prior initialization.

### Highlights
Prevents FUNCNEST on Escape, preserves normal zsh prompt behavior, and remains safe when dot_zshrc is sourced multiple times.

### Rules
Starship init now only runs if prompt_starship_precmd is not already defined.

### Examples
Verified by running zsh -n dot_zshrc and sourcing dot_zshrc twice, which returned nonrecursive.

## Facts
- **starship_escape_recursion**: Pressing Escape in zsh triggered starship_zle-keymap-select-wrapped recursion and a FUNCNEST error. [project]
- **starship_init_idempotence**: The root cause was repeated starship init zsh wrapping zle-keymap-select around Starship’s own wrapper. [project]
- **starship_init_guard**: Starship init now only runs if prompt_starship_precmd is not already defined. [project]
- **starship_wrapper_repair**: A repair path was added for shells that had already entered the recursive wrapper state. [project]
- **starship_fix_verification**: Verification included zsh -n dot_zshrc and re-sourcing dot_zshrc twice returning nonrecursive. [project]

## Consolidated Overview
- Fixes a zsh/Starship bug where pressing Escape triggered recursive wrapping of `zle-keymap-select`, leading to `FUNCNEST` errors.
- The Starship init block in `dot_zshrc` was made idempotent so it only initializes once, even if the file is sourced multiple times.
- A repair path was added for shells already stuck in the broken recursive-wrapper state, not just new sessions.
- Verification included parsing safety checks with `zsh -n dot_zshrc` and confirming that sourcing the config twice remains nonrecursive.
- The solution preserves normal zsh prompt behavior and avoids Starship wrapping its own widget.
- The guard condition uses `prompt_starship_precmd` as the sentinel for prior initialization.
- Notable entities/patterns: Starship zsh integration, `zle-keymap-select`, `prompt_starship_precmd`, `dot_zshrc`, `FUNCNEST`, and the idempotent-init / repair pattern.