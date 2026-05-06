---
title: Curation Workflow Rules
summary: Curation workflow rules emphasizing RLM pattern, recon-first processing, single-pass handling for small contexts, chunked mapExtract for large contexts, UPSERT preference, and verification via applied file paths.
tags: []
related: [facts/project/curation_workflow_rules.md]
keywords: []
createdAt: '2026-05-06T09:33:21.664Z'
updatedAt: '2026-05-06T09:55:36.879Z'
---
## Reason
Curate workflow rules and operational constraints from provided context

## Raw Concept
**Task:**
Document the curation workflow rules for RLM-based knowledge operations

**Changes:**
- Recorded that recon was precomputed and suggested single-pass mode
- Captured taskId and timeout requirements for mapExtract usage
- Captured verification rule for curate results
- Captured single-pass execution guidance for small contexts
- Captured chunked extraction guidance using mapExtract
- Captured UPSERT preference and verification constraints

**Flow:**
recon -> single-pass or chunked extraction -> curate -> verify via applied file paths

**Timestamp:** 2026-05-06T09:55:30.450Z

**Patterns:**
- `^single-pass$` - Suggested mode indicating chunking should be skipped
- `^UPSERT$` - Preferred curate operation

## Narrative
### Structure
The workflow begins with precomputed recon data, then chooses single-pass handling for small contexts or chunked mapExtract processing for larger inputs before curation.

### Dependencies
Depends on the precomputed recon result, context/history/metadata variables, and the curate tool for persistence.

### Highlights
The workflow explicitly forbids printing raw context, requires result.summary.failed checks, and uses applied file paths for verification.

## Facts
- **curation_workflow**: Curate tasks should use the RLM approach with context, history, metadata, and precomputed recon data. [convention]
- **single_pass_mode**: For small contexts, suggestedMode single-pass should skip chunking and proceed directly to curate. [convention]
- **chunked_extraction**: For chunked contexts, mapExtract should be used for parallel extraction with taskId passed as a bare variable. [convention]
- **curate_operation_preference**: UPSERT is the preferred curation operation unless ADD, UPDATE, MERGE, or DELETE is specifically required. [convention]
- **verification_rule**: Verification should rely on result.applied[].filePath and should not call readFile for verification. [convention]

---

## Consolidated Summary
The file captures RLM curation workflow instructions for a single-pass session, emphasizing that recon was already precomputed and should not be rerun. Key operational requirements include passing taskId as a bare variable (not a string) and using timeout 300000 on any code_exec call that includes mapExtract. Verification must be performed by checking result.applied[].filePath rather than calling readFile. The document frames the flow as precomputed recon -> extract or curate -> verify applied file paths. It notes the provided context size and that there are no messages, reinforcing that this is instruction capture rather than interactive processing. Structure includes Reason, Raw Concept, Narrative, and Facts sections. Notable entities/patterns: RLM-based knowledge processing, mapExtract, curate result object, taskId, and filePath-based verification.
