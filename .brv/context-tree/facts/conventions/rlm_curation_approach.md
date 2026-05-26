---
title: RLM Curation Approach
summary: RLM curation uses precomputed recon, single-pass extraction when suggested, UPSERT for durable knowledge, and file-path-based verification.
tags: []
related: []
keywords: []
createdAt: '2026-05-26T17:08:50.323Z'
updatedAt: '2026-05-26T17:08:50.324Z'
---
## Reason
Capture the curation workflow rules from the current RLM instruction context

## Raw Concept
**Task:**
Document the RLM curation workflow and operational constraints for this session.

**Changes:**
- Use the precomputed recon result instead of recomputing it
- Proceed with single-pass extraction because the suggested mode is single-pass
- Pass taskId as a bare variable when mapExtract is used
- Verify curated files through result.applied[].filePath

**Flow:**
recon precomputed -> extract relevant facts -> curate with UPSERT -> verify applied file paths

**Timestamp:** 2026-05-26T17:08:42.554Z

**Author:** ByteRover

## Narrative
### Structure
This knowledge captures the required RLM workflow for curation sessions, especially the single-pass path and verification rules.

### Dependencies
Depends on the precomputed recon payload, the session-scoped context/history/metadata variables, and the curate tool result object.

### Highlights
The instruction emphasizes not printing raw context, not recomputing recon, and using UPSERT as the preferred persistence mechanism.

## Facts
- **curation_operation**: Context tree curation must use UPSERT by default. [convention]
- **rlm_workflow_trigger**: When curation prompt includes Context variable, History variable, and Metadata variable, the RLM workflow should be followed directly. [convention]
- **recon_mode**: Reconstruction/recon was already computed and suggested single-pass extraction. [convention]
- **mapextract_task_id**: The task ID must be passed as a bare variable to mapExtract when used. [convention]
- **verification_method**: Verification must rely on result.applied[].filePath and not readFile. [convention]
