---
confidence: 0.98
sources: [architecture/_index.md, dot_config/_index.md]
synthesized_at: '2026-05-26T17:27:09.332Z'
type: synthesis
title: Idempotent startup is the shared hardening pattern
summary: Repeated initialization paths are made safe by guarding them with idempotent setup and recovery for already-broken state.
tags: [bootstrap, idempotency, shell, hardening, recovery]
related: []
keywords: [idempotent, initialization, bootstrap, wrapper, recovery, starship, startup, hardening]
createdAt: '2026-05-26T17:27:09.332Z'
updatedAt: '2026-05-26T17:27:09.332Z'
---

# Idempotent startup is the shared hardening pattern

Both the architecture notes and the zsh config fix converge on the same robustness pattern: startup/bootstrap logic should only initialize once, and it should also recover shells or plugin paths that are already in a partially corrupted wrapped state.

## Evidence

- **architecture**: The architecture summary says repeated startup/bootstrap paths are hardened by making initialization idempotent and stable across repeated transform/persist cycles, with brittle readiness gating removed from durable paths.
- **dot_config**: The zsh summary says the Starship init block in dot_zshrc was made idempotent so it initializes only once, and it includes a recovery path for shells already stuck in the recursive-wrapper state.
