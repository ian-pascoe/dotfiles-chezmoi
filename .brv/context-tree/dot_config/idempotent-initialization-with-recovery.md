---
confidence: 0.97
sources: [architecture/_index.md, dot_config/_index.md]
synthesized_at: '2026-05-27T11:28:37.690Z'
type: synthesis
title: Idempotent Initialization with Recovery
summary: Make startup scripts idempotent and include a recovery path for already‑corrupted state.
tags: [startup, idempotent, recovery, zsh, plugin]
related: []
keywords: [idempotent, initialization, recovery, sentinel, recursive, startup, bootstrap, zsh, starship]
createdAt: '2026-05-27T11:28:37.690Z'
updatedAt: '2026-05-27T11:28:37.690Z'
---

# Idempotent Initialization with Recovery

Both the architecture notes on Byterover plugin bootstrapping and the dot_config zsh Starship fix rely on idempotent initialization plus recovery for recursive‑wrapper failures.

## Evidence

- **architecture**: Idempotent startup/init paths are a hardening pattern across shell startup and plugin bootstrap, assuming repeated runs and partial failures.
- **dot_config**: Starship init block in dot_zshrc is made idempotent with a sentinel (prompt_starship_precmd) and includes a recovery path for shells already stuck in recursive wrapping.
