---
title: RLM Curation Approach
summary: RLM curation uses precomputed recon, single-pass extraction for small contexts, and verification via applied file paths.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T11:26:02.585Z'
updatedAt: '2026-05-22T11:26:02.585Z'
---
## Reason
Capture the curation workflow and execution constraints from the provided context.

## Raw Concept
**Task:**
Document the RLM curation approach and execution constraints for this session

**Changes:**
- Used precomputed recon output instead of recomputing it
- Selected single-pass processing because the context is small
- Preserved constraints to avoid printing raw context and to verify via applied file paths

**Flow:**
precomputed recon -> single-pass extraction -> curate -> verify applied file paths

**Timestamp:** 2026-05-22T11:25:54.967Z

## Narrative
### Structure
This knowledge captures the session-level workflow instructions for curation using the RLM approach.

### Dependencies
Depends on precomputed recon metadata and the provided context/history/task identifiers.

### Highlights
Single-pass mode was recommended. The workflow requires using tools.curation and verifying results through applied file paths rather than rereading files.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon has already been precomputed. For chunked extraction use tools.curation.mapExtract() with the provided taskId. Verify via result.applied[].filePath.

## Facts
- **rlm_curation_approach**: This session uses the RLM curation approach with precomputed recon and single-pass extraction. [convention]
- **recon_mode**: Recon for this context recommended single-pass mode with one chunk. [convention]
- **context_size**: The context variable contains 4189 characters across 69 lines and 0 messages. [project]
- **curation_instructions**: The task requires extracting facts and curating them without printing raw context or re-running recon. [convention]
