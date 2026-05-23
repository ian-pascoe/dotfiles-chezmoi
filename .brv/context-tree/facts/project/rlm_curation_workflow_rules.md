---
consolidated_at: '2026-05-23T09:32:30.314Z'
consolidated_from: [{date: '2026-05-23T09:32:30.314Z', path: facts/conventions/rlm_curation_workflow_rules.md, reason: 'These files are near-duplicates covering the same RLM curation workflow rules: precomputed recon, single-pass vs chunked extraction, mapExtract timeout/taskId handling, dedup/group helpers, UPSERT preference, and verification via applied file paths. The project file is richer and includes session-specific details, so it should be the merge target.'}]
---
# Title: RLM Curation Workflow Rules

This document defines the durable RLM curation workflow rules for handling current-task context in the knowledge tree. It captures the required precomputed recon behavior, the single-pass vs chunked extraction decision rule, the mapExtract timeout and bare taskId requirements, deduplication/grouping helpers, UPSERT preference, and verification via applied file paths.

## Core workflow
- Use precomputed recon when available; do not rerun recon.
- If recon suggests single-pass mode and the context is small/compact, skip chunking and proceed directly to extraction and curation.
- If chunked extraction is required, use tools.curation.mapExtract with taskId passed as a bare variable and set timeout: 300000 on the code_exec call itself.
- Organize extracted facts with tools.curation.dedup() and tools.curation.groupBySubject().
- Prefer UPSERT for curation operations.
- Verify curation via result.summary.failed and result.applied[].filePath; do not use readFile for verification.
- Do not print raw context.

## Session constraints and patterns
- The workflow is intended for RLM-based curation sessions that preserve durable knowledge instead of chat-only context.
- The decision rule is: precomputed recon -> choose single-pass or chunked extraction -> curate with UPSERT -> verify applied file paths.
- Required injected variable naming conventions may include ^__curate_ctx_ and ^__taskId_.

## Narrative / rationale
This workflow exists to make curation deterministic, efficient, and safe for compact contexts while still supporting chunked extraction for larger inputs. The rules emphasize bounded-best-effort processing, preserving factual statements, and validating success directly from curate results.

## Facts
- Recon is precomputed in the current workflow and should not be recomputed.
- Single-pass processing is the default for compact contexts.
- mapExtract is only for chunked extraction and requires a bare taskId variable.
- Verification must use result.applied[].filePath.
- UPSERT is the preferred curation operation.