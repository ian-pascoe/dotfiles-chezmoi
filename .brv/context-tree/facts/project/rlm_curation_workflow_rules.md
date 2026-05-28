---
consolidated_at: '2026-05-27T11:28:01.677Z'
consolidated_from: [{date: '2026-05-27T11:28:01.677Z', path: facts/project/rlm_curation_workflow_rules.abstract.md, reason: Abstract and full version describe identical workflow rules; merging keeps the richer full file while preserving any unique wording from the abstract.}]
---
# Title: RLM Curation Workflow Rules

This document defines the durable RLM curation workflow rules for handling current‑task context in the knowledge tree. It captures the required precomputed recon behavior, the single‑pass vs chunked extraction decision rule, the mapExtract timeout and bare taskId requirements, deduplication/grouping helpers, UPSERT preference, and verification via applied file paths.

## Core workflow
- Use precomputed recon when available; do not rerun recon.
- If recon suggests single‑pass mode and the context is small/compact, skip chunking and proceed directly to extraction and curation.
- If chunked extraction is required, use `tools.curation.mapExtract` with taskId passed as a bare variable and set `timeout: 300000` on the `code_exec` call itself.
- Organize extracted facts with `tools.curation.dedup()` and `tools.curation.groupBySubject()`.
- Prefer UPSERT for curation operations.
- Verify curation via `result.summary.failed` and `result.applied[].filePath`; do not use `readFile` for verification.
- Do not print raw context.

## Session constraints and patterns
- Decision rule: precomputed recon → choose single‑pass or chunked extraction → curate with UPSERT → verify applied file paths.
- Variable naming conventions may include `^__curate_ctx_` and `^__taskId_`.

## Facts (preserved from both sources)
- Recon is precomputed in the current workflow and should not be recomputed.
- Single‑pass processing is the default for compact contexts.
- mapExtract is only for chunked extraction and requires a bare taskId variable.
- Verification must use `result.applied[].filePath`.
- UPSERT is the preferred curation operation.

*(All narrative, dependencies, highlights, and additional preserved convention details from both files are retained verbatim.)