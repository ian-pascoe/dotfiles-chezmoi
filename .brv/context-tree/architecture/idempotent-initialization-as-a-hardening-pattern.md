---
confidence: 0.87
sources: [dot_config/_index.md, architecture/_index.md]
synthesized_at: "2026-05-20T16:22:10.256Z"
type: synthesis
title: Idempotent initialization as a hardening pattern
summary: Both shell and plugin work harden repeated startup paths by making initialization safe to rerun and recover from partial prior state.
tags: [zsh, opencode, plugins, idempotency]
related: []
keywords:
  [idempotent, initialization, bootstrap, recovery, recursion, startup, ready-state, repeatable]
createdAt: "2026-05-20T16:22:10.256Z"
updatedAt: "2026-05-20T16:22:10.256Z"
---

# Idempotent initialization as a hardening pattern

Across domains, the recurring fix is to treat initialization as idempotent and resilient to already-corrupted state: the zsh/Starship fix prevents recursive widget wrapping when dot_zshrc is sourced multiple times, while the Opencode memory plugin keeps bootstrap and recall behavior stable across repeated transform/persist cycles and removes brittle readiness gating from the durable paths.

## Evidence

- **dot_config**: The Starship init block in dot_zshrc was made idempotent so it initializes only once, even if the file is sourced multiple times, and it includes a recovery path for shells already stuck in the recursive-wrapper state.
- **architecture**: The Byterover plugin preserves .brv bootstrap behavior, performs persist/curation on idle or compaction, recalls during system transform, and removes readiness checks from persist/curation while keeping brvBridge.ready() for recall.
