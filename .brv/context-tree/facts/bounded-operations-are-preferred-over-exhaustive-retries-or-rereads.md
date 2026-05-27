---
confidence: 0.96
sources: [facts/_index.md, architecture/_index.md]
synthesized_at: '2026-05-26T17:27:09.338Z'
type: synthesis
title: Bounded operations are preferred over exhaustive retries or rereads
summary: Across curation and workflow notes, the system favors bounded, best-effort execution with direct verification instead of full recomputation.
tags: [bounded-processing, recall, verification, curation, timeouts]
related: []
keywords: [bounded, best-effort, recall, single-pass, verification, timeout, curation, replay]
createdAt: '2026-05-26T17:27:09.338Z'
updatedAt: '2026-05-26T17:27:09.338Z'
---

# Bounded operations are preferred over exhaustive retries or rereads

The facts domain and architecture notes both emphasize bounded workflows: recall is limited by a recent-turn window and timeout protection, curation is single-pass when possible, and success is verified from applied results rather than re-reading or rerunning work.

## Evidence

- **facts**: The facts summary says the knowledge base prefers bounded operations instead of perfect completeness, with recall limited to a recent turn window, single-pass processing when recon is available, and verification via applied file paths.
- **architecture**: The architecture summary says recall/curation is bounded to recent context, current-turn-only curation is preserved, and verification uses result.applied[].filePath.
