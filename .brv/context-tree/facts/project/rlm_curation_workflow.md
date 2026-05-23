---
title: RLM Curation Workflow
summary: RLM curation uses recon, single-pass extraction for small contexts, mapExtract for chunked contexts, UPSERT-based curation, and post-apply verification.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T18:20:53.863Z'
updatedAt: '2026-05-22T18:20:53.863Z'
---
## Reason
Preserve the current RLM curation approach, session constraints, and workflow rules from the provided context.

## Raw Concept
**Task:**
Curate the session instructions for RLM-based context curation.

**Changes:**
- Captured the precomputed recon result and session-specific extraction constraints.
- Recorded the required verification method and timeout rule for mapExtract calls.
- Preserved the instruction to use single-pass curation for this small context.

**Flow:**
recon already computed -> single-pass decision -> curate directly -> verify applied file paths

**Timestamp:** 2026-05-22T18:20:45.393Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This context defines how to process a small RLM curation session: recon is precomputed, single-pass is recommended, and chunking is unnecessary unless extraction is later needed.

### Dependencies
Depends on tools.curation.dedup and tools.curation.groupBySubject for organizing extracted facts, and on tools.curate for applying UPSERT operations.

### Highlights
The session emphasizes not printing raw context, not rerunning recon, and validating success by checking applied file paths after curation.

## Facts
- **rlm_recon_mode**: For this session, recon was already computed and suggested single-pass mode. [project]
- **rlm_context_size**: For this session, the context size was 3352 characters across 42 lines with 0 messages. [project]
- **rlm_task_id**: For this session, mapExtract should use taskId __taskId_77becac4_4ebd_48c7_a47c_585d41f00645 when chunked extraction is needed. [project]
- **mapextract_timeout**: For this session, any code_exec call containing mapExtract must use timeout: 300000 on the code_exec tool call itself. [convention]
- **verification_method**: For this session, verification must use result.applied[].filePath and must not call readFile for verification. [convention]
