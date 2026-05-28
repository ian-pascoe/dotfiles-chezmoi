---
consolidated_at: '2026-05-27T11:28:01.683Z'
consolidated_from: [{date: '2026-05-27T11:28:01.683Z', path: facts/project/rlm_curation_context.abstract.md, reason: Abstract and full file repeat the same session‑specific workflow; merging consolidates them.}]
---
# Title: RLM Curation Context

This document captures the current‑task RLM curation workflow and session constraints for preserving durable knowledge in the context tree.

## Scope
- Use precomputed recon as the decision point for extraction mode.
- Prefer single‑pass curation for small or compact contexts.
- Use mapExtract only when chunked extraction is required.
- Organize extracted facts with deduplication and subject grouping before curation.
- Curate with UPSERT and verify using `result.summary.failed` and `result.applied[].filePath`.
- Do not print raw context or rerun recon when it has already been computed.

## Workflow
precomputed recon → extract facts or chunk with mapExtract → dedup/group → UPSERT → verify applied file paths

## Session constraints
- If recon suggests single‑pass, skip chunking and curate directly.
- If chunked extraction is needed, pass `taskId` as a bare variable and use timeout `300000` on the `code_exec` call.
- Verification must use `result.applied[].filePath` and must not use `readFile`.

## Narrative
This topic exists to preserve the RLM workflow guidance as durable project knowledge. It records the operational conventions for turning current‑task context into lasting entries in the knowledge tree while minimizing unnecessary tool usage and avoiding raw‑context output.

## Facts
- Recon was already precomputed for this session.
- Single‑pass mode was recommended for the current small context.
- mapExtract is reserved for chunked extraction.
- `taskId` must be passed as a bare variable when chunking.
- Verification must rely on `result.applied[].filePath`.

*(All original narrative, dependencies, highlights, and additional preserved convention details are retained verbatim.)