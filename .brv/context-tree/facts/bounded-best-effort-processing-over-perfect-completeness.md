---
confidence: 0.92
sources: [architecture/_index.md, facts/_index.md]
synthesized_at: "2026-05-20T16:22:10.258Z"
type: synthesis
title: Bounded, best-effort processing over perfect completeness
summary: Memory recall, curation, and workflow verification all prefer bounded, fail-safe execution over exhaustive processing.
tags: [memory, recall, curation, verification]
related: []
keywords: [bounded, best-effort, timeout, single-pass, window, recall, verification, noise]
createdAt: "2026-05-20T16:22:10.258Z"
updatedAt: "2026-05-20T16:22:10.258Z"
---

# Bounded, best-effort processing over perfect completeness

The knowledge base repeatedly favors bounded, best-effort operations: memory recall is limited to a recent turn window with timeout protection, curation avoids noisy or empty inputs, and workflow rules emphasize single-pass recon with direct verification of applied results rather than reprocessing or overchecking.

## Evidence

- **architecture**: Recall is bounded to 3 recent user turns and 4096 formatted characters, curation stays limited to the current completed turn, and recall is described as best-effort with timeout protection.
- **facts**: The standard curation flow is precomputed recon → extract or curate → verify applied file paths, and when recon is already available the session uses single-pass curation mode instead of rerunning recon.
