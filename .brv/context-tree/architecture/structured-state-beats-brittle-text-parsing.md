---
confidence: 0.93
sources: [architecture/_index.md, dot_config/_index.md]
synthesized_at: '2026-05-26T17:27:09.335Z'
type: synthesis
title: Structured state beats brittle text parsing
summary: Both domains favor explicit machine-readable state and sentinels over heuristic text matching for correctness and verification.
tags: [structured-state, verification, parsing, metadata, shell]
related: []
keywords: [structured, sentinel, metadata, verification, heuristics, json, state, parsing]
createdAt: '2026-05-26T17:27:09.335Z'
updatedAt: '2026-05-26T17:27:09.335Z'
---

# Structured state beats brittle text parsing

The knowledge base repeatedly prefers structured, inspectable state over delimiter-heavy or text-heuristic approaches: plugin curation uses structured JSON and explicit applied-file metadata, while shell startup uses a sentinel to avoid re-parsing ambiguous init state.

## Evidence

- **architecture**: The architecture summary says the Byterover plugin moved from delimiter-heavy pseudo-XML toward structured JSON serialization, skipping reasoning content and using result.applied[].filePath for verification instead of rereading files.
- **dot_config**: The zsh summary says prompt_starship_precmd is used as a sentinel to detect prior initialization, preventing recursive wrapping instead of relying on brittle textual state checks.
