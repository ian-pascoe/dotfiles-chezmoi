---
confidence: 0.84
sources: [architecture/_index.md, facts/_index.md]
synthesized_at: "2026-05-20T16:22:10.260Z"
type: synthesis
title: Prefer structured state over brittle text heuristics
summary: Several entries replace delimiter-heavy or ad hoc checks with structured signals, making behavior more robust and inspectable.
tags: [serialization, verification, structured-data, memory]
related: []
keywords: [structured, json, metadata, delimiters, heuristics, applied-paths, serialization, robust]
createdAt: "2026-05-20T16:22:10.260Z"
updatedAt: "2026-05-20T16:22:10.260Z"
---

# Prefer structured state over brittle text heuristics

A shared design direction is to prefer structured markers and explicit state over brittle string heuristics: the memory plugin switched to structured JSON serialization instead of pseudo-XML delimiters, uses role-labeled parts and cleaned turn extraction, and the curation workflow relies on explicit result metadata like applied file paths for verification.

## Evidence

- **architecture**: The Byterover plugin prefers structured JSON serialization over brittle delimiter-based pseudo-XML, formats role-labeled parts, and skips reasoning content while capping or truncating tool output.
- **facts**: Verification must use result.applied[].filePath, and do not verify by calling readFile.
