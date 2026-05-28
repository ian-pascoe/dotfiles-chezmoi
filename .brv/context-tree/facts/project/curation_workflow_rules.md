---
consolidated_at: '2026-05-27T11:28:01.672Z'
consolidated_from: [{date: '2026-05-27T11:28:01.672Z', path: facts/project/curation_workflow_rules.abstract.md, reason: Abstract and full markdown cover the same workflow rules; merging preserves all details in the richer full file.}]
---
# Title: Curation Workflow Rules

This document defines the repo‑specific RLM curation workflow and constraints used for curating context into the knowledge tree.

## Raw Concept
**Task:** Document the RLM curation workflow rules and execution constraints used for curating context into the knowledge tree.

**Changes:**
- Recorded that recon was precomputed and suggested single‑pass mode
- Captured taskId and timeout requirements for mapExtract usage
- Captured verification rule for curate results
- Captured single‑pass execution guidance for small contexts
- Captured chunked extraction guidance using mapExtract, dedup, and groupBySubject
- Captured UPSERT preference and verification constraints
- Established that recon may already be computed and should be reused
- Specified single‑pass processing without chunking
- Set timeout requirement for mapExtract‑containing code_exec calls
- Defined verification by applied file paths only
- Recorded other session‑specific conventions (see abstract for full list)

## Flow:
recon → choose single‑pass or chunked extraction → curate with UPSERT → verify result summary and applied file paths

## Timestamp: 2026‑05‑22T16:00:04.872Z

**Author:** ByteRover context engineer

### Narrative, Facts, Rules, etc. (preserved from both sources)