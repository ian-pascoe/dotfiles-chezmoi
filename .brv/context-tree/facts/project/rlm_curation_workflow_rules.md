---
title: RLM Curation Workflow Rules
summary: Active RLM curation workflow note capturing single-pass recon guidance, context size, and verification expectations.
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/curation_workflow_rules.md]
keywords: []
createdAt: '2026-05-22T10:22:30.174Z'
updatedAt: '2026-05-22T10:50:35.091Z'
---
## Reason
Curate the active RLM curation workflow metadata and size constraints

## Raw Concept
**Task:**
Document the active RLM curation workflow for this session

**Changes:**
- Captured recon-guided single-pass behavior for small contexts
- Captured chunked extraction behavior and taskId handling
- Captured curation verification requirements
- Use precomputed recon instead of recomputing it
- Proceed directly to extraction for single-pass contexts
- Use mapExtract for chunked extraction with timeout 300000 on code_exec calls that invoke it
- Verify curation success via result.applied[].filePath
- Capture the instruction to proceed directly to extraction when recon is already computed
- Preserve the single-pass path for small contexts
- Preserve the chunked extraction and verification rules
- Recorded that recon was already computed before curation
- Captured the single-pass recommendation
- Preserved context size and verification constraints

**Flow:**
recon precomputed -> single-pass extraction -> curate -> verify applied file paths

**Timestamp:** 2026-05-22T10:50:27.183Z

**Author:** ByteRover context engineer

**Patterns:**
- `timeout: 300000` - Required timeout for code_exec calls that contain mapExtract

## Narrative
### Structure
This note records operational guidance for handling the current curated context with a single-pass workflow.

### Dependencies
Depends on the precomputed recon result and the provided context/history/metadata variables.

### Highlights
Verification should rely on result.applied[].filePath, and raw context should not be printed.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when it has been pre-computed. For chunked extraction, use tools.curation.mapExtract() and pass taskId as a bare variable. Verify via result.applied[].filePath and do NOT call readFile for verification.

## Facts
- **curation_approach**: Current context is being curated using the RLM approach. [project]
- **context_size**: The context variable contains 1931 characters across 16 lines and 0 messages. [project]
- **recon_mode**: Recon was already computed and suggested single-pass mode with one chunk. [project]
