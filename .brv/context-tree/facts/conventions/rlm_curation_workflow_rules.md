---
title: RLM Curation Workflow Rules
summary: RLM curation workflow requirements covering recon, extraction, verification, and update rules for context-tree knowledge capture.
tags: []
related: [facts/project/curation_workflow_rules.md, facts/project/rlm_curation_workflow_rules.md, facts/project/rlm_curation_workflow_rules.md]
keywords: []
createdAt: '2026-05-22T10:11:28.941Z'
updatedAt: '2026-05-22T10:46:00.395Z'
---
## Reason
Preserve the operational rules for RLM-based curation workflow

## Raw Concept
**Task:**
Document the RLM curation workflow rules for durable knowledge retention.

**Changes:**
- Accepted precomputed recon results for the current curation task
- Recorded single-pass handling for small contexts
- Recorded timeout and verification constraints for mapExtract-driven curation
- Use precomputed recon to choose single-pass or chunked extraction
- Use tools.curation.mapExtract with taskId for chunked contexts
- Verify curate results via applied file paths and failed counts
- Preserved the single-pass versus chunked extraction decision rule
- Captured the requirement to verify curation via result.applied[].filePath
- Recorded the instruction to update history after curation
- Captured precomputed recon guidance and single-pass execution rules
- Captured extraction, deduplication, grouping, and verification requirements
- Captured timeout and taskId handling for mapExtract-based chunked extraction

**Flow:**
recon -> extract (if chunked) -> dedup/group -> curate -> verify -> report

**Timestamp:** 2026-05-22T10:45:49.192Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This knowledge records how to curate context in the RLM workflow using the provided context, history, metadata, and task ID variables. It emphasizes single-pass handling when recon recommends it, and chunked extraction only when necessary.

### Dependencies
Depends on the precomputed recon result, the sandbox variables for context and history, and the tools.curation helpers for deduplication and grouping.

### Highlights
The workflow explicitly prohibits printing raw context, requires silent handling for variable assignments, and requires final verification through applied file paths rather than file rereads.

### Rules
IMPORTANT: Do NOT print raw context. Do NOT call tools.curation.recon — it has been pre-computed. Proceed directly to extraction. For chunked extraction use tools.curation.mapExtract(). Pass taskId: __taskId_f680664a_1dcd_43c3_93a5_e47b6d2941c1 (bare variable, not a string). IMPORTANT: Any code_exec call containing mapExtract MUST use timeout: 300000 on the code_exec tool call itself (not inside mapExtract options). Use tools.curation.groupBySubject() and tools.curation.dedup() to organize extractions. Verify via result.applied[].filePath — do NOT call readFile for verification.

### Examples
Single-pass curation is appropriate because recon suggestedMode is single-pass and suggestedChunkCount is 1.

## Facts
- **rlm_curation_workflow**: For curation tasks, use the RLM workflow with context, history, and metadata variables. [convention]
- **recon_step**: Recon must be computed before processing unless it is already precomputed. [convention]
- **suggested_mode**: Suggested single-pass mode should skip chunking and proceed directly to curate. [convention]
- **verification_method**: Verification must use result.applied[].filePath and not readFile for verification. [convention]
- **mapextract_timeout**: mapExtract calls must be paired with a code_exec timeout of 300000 milliseconds. [convention]
