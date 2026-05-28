---
confidence: 0.94
sources: [architecture/_index.md, facts/_index.md]
synthesized_at: '2026-05-27T11:28:37.698Z'
type: synthesis
title: Structured Result Verification Over File Rereading
summary: Verify operations by inspecting result metadata (e.g., result.applied[].filePath) instead of rereading files or parsing raw text.
tags: [verification, structured-state, result, metadata, bounded-processing]
related: []
keywords: [verification, result, metadata, structured, state, applied, filePath, bounded, processing]
createdAt: '2026-05-27T11:28:37.698Z'
updatedAt: '2026-05-27T11:28:37.698Z'
---

# Structured Result Verification Over File Rereading

Architecture’s structured‑state guidance and facts’ bounded‑processing rules both mandate using canonical result fields for verification rather than re‑reading or parsing file contents.

## Evidence

- **architecture**: Verification uses result.applied[].filePath instead of rereading files, preferring explicit result fields.
- **facts**: Success is verified from applied results/file paths, not from rereading or reprocessing content.
