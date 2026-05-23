---
title: RLM Curation Approach and Session Constraints
summary: 'RLM curation approach: use recon first, prefer single-pass for small contexts, use mapExtract only for chunked contexts, preserve facts and verify curate results inline.'
tags: []
related: [facts/conventions/rlm_curation_approach.md, facts/project/rlm_curation_workflow_rules.md]
keywords: []
createdAt: '2026-05-22T16:04:40.782Z'
updatedAt: '2026-05-22T16:39:54.520Z'
---
## Reason
Curate the provided RLM curation guidance and session constraints into durable knowledge

## Raw Concept
**Task:**
Document the RLM curation workflow, processing modes, and verification requirements for session-based context curation.

**Changes:**
- Captured the precomputed recon recommendation and extraction guidance
- Recorded timeout and verification requirements for curation calls
- Preserved the instruction to avoid printing raw context
- Established recon-first workflow for curation tasks
- Defined single-pass processing for small contexts
- Defined chunked extraction flow using mapExtract for larger contexts
- Specified inline verification using curate results

**Files:**
- .brv/context-tree/facts/project/context.md

**Flow:**
recon -> select single-pass or chunked extraction -> curate UPSERTs -> verify result.summary.failed and applied file paths

**Timestamp:** 2026-05-22

**Author:** ByteRover context engineering guidance

## Narrative
### Structure
The guidance defines an RLM workflow with a required reconnaissance step, then branches into either single-pass curation for small inputs or chunked extraction for larger inputs.

### Dependencies
Depends on sandbox variables for context, history, metadata, and task id; uses tools.curation.recon, mapExtract, dedup, groupBySubject, and tools.curate.

### Highlights
Recon was already computed for this session and indicated single-pass mode with one suggested chunk. The guidance emphasizes preserving facts, avoiding raw context output, and verifying curation success from the result object.

### Rules
Do not print raw context. Do not call tools.curation.recon when recon has already been computed. For chunked extraction, pass the taskId as a bare variable. Use timeout 300000 on code_exec when mapExtract is used. Verify via result.applied[].filePath and do not call readFile for verification.

## Facts
- **rlm_mode_selection**: Single-pass mode should be used when recon suggests a small context and chunking is unnecessary. [convention]
- **recon_function**: tools.curation.recon provides metadata, history, head/tail previews, and a suggested processing mode. [convention]
- **map_extract_chunking**: If recon suggests chunked processing, tools.curation.mapExtract should be used with a chunk size around 8000 characters. [convention]
- **curate_verification**: Curate operations should be verified by checking result.summary.failed and result.applied[].filePath. [convention]
- **stdout_constraint**: RLM curation context should not print raw context to stdout. [convention]
