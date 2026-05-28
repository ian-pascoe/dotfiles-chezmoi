---
confidence: 0.88
sources: [architecture/_index.md, dot_config/_index.md]
synthesized_at: '2026-05-27T11:28:37.700Z'
type: synthesis
title: Sentinel‑Based Guarding for Idempotent Logic
summary: Use a lightweight sentinel variable or marker to detect prior initialization and skip repeated work.
tags: [sentinel, guard, idempotent, state, zsh]
related: []
keywords: [sentinel, guard, idempotent, initialization, check, prompt_starship_precmd, state, verification]
createdAt: '2026-05-27T11:28:37.700Z'
updatedAt: '2026-05-27T11:28:37.700Z'
---

# Sentinel‑Based Guarding for Idempotent Logic

Architecture’s structured‑state approach and dot_config’s Starship fix both employ sentinel checks (e.g., prompt_starship_precmd) to ensure idempotent behavior.

## Evidence

- **architecture**: Structured JSON serialization includes explicit sentinels for verification instead of brittle text matching.
- **dot_config**: Uses prompt_starship_precmd as the sentinel to detect prior Starship initialization.
