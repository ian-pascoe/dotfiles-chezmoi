---
consolidated_at: '2026-05-26T17:27:01.058Z'
consolidated_from: [{date: '2026-05-26T17:27:01.058Z', path: facts/conventions/rlm_curation_approach.md, reason: 'These two files describe the same RLM curation approach and are highly overlapping. The project file is richer and already positioned as the canonical consolidated version, so the convention file should be merged into it.'}]
---
# Title: RLM Curation Approach

This document defines the RLM curation workflow for context engineering sessions. It captures the recon-first process, single-pass handling for small contexts, chunked extraction with mapExtract for larger contexts, UPSERT-based curation, and verification via result.applied[].filePath.

## Workflow
1. Use precomputed recon to decide the extraction mode.
2. If suggestedMode is single-pass and the context is compact, proceed directly to extraction and curation.
3. If chunked extraction is needed, use tools.curation.mapExtract with taskId passed as a bare variable.
4. Use tools.curation.groupBySubject() and tools.curation.dedup() to organize extracted facts.
5. Curate with UPSERT.
6. Verify curated output via result.summary.failed and result.applied[].filePath.

## Rules
- Do not print raw context.
- Do not call tools.curation.recon when it has already been precomputed.
- When using mapExtract, set code_exec timeout to 300000.
- Do not use readFile for verification.
- Prefer UPSERT for durable knowledge capture.

## Narrative
The approach exists to make curation deterministic and safe, preserving only durable knowledge while avoiding unnecessary chunking for compact contexts. It also standardizes verification so results are checked directly from the curate response instead of rereading files.

## Facts
- Recon is precomputed and should not be recalculated.
- Small contexts should use single-pass processing.
- Chunked extraction uses mapExtract with a bare taskId.
- Verification must rely on result.applied[].filePath.
- UPSERT is the preferred curate operation.

## Additional preserved convention details
- The workflow should follow the session-scoped RLM path directly when Context, History, and Metadata variables are present.
- The process should not recompute recon when a precomputed recon result is already available.
- The verification method must rely on the curate result object rather than file rereads.
- The approach emphasizes avoiding raw context output and keeping extraction bounded to the mode suggested by recon.
