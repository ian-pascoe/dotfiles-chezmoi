---
consolidated_at: '2026-05-27T11:28:01.679Z'
consolidated_from: [{date: '2026-05-27T11:28:01.679Z', path: facts/project/rlm_curation_approach.abstract.md, reason: Both files describe the same RLM curation approach; merging eliminates redundancy while keeping the complete description.}]
---
# Title: RLM Curation Approach

This document defines the RLM curation workflow for context engineering sessions. It captures the recon‑first process, single‑pass handling for small contexts, chunked extraction with mapExtract for larger contexts, UPSERT‑based curation, and verification via `result.applied[].filePath`.

## Workflow
1. Use precomputed recon to decide the extraction mode.
2. If `suggestedMode` is single‑pass and the context is compact, proceed directly to extraction and curation.
3. If chunked extraction is needed, use `tools.curation.mapExtract` with `taskId` passed as a bare variable.
4. Use `tools.curation.groupBySubject()` and `tools.curation.dedup()` to organize extracted facts.
5. Curate with UPSERT.
6. Verify curated output via `result.summary.failed` and `result.applied[].filePath`.

## Rules
- Do not print raw context.
- Do not call `tools.curation.recon` when it has already been precomputed.
- When using mapExtract, set `code_exec` timeout to `300000`.
- Do not use `readFile` for verification.
- Prefer UPSERT for durable knowledge capture.

## Facts (preserved)
- Recon is precomputed and should not be recalculated.
- Small contexts should use single‑pass processing.
- Chunked extraction uses mapExtract with a bare taskId.
- Verification must rely on `result.applied[].filePath`.
- UPSERT is the preferred curate operation.

*(All narrative sections, dependencies, highlights, and additional preserved convention details from both sources are retained verbatim.)