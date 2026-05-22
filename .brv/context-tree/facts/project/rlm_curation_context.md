---
title: RLM Curation Context
summary: RLM curation uses recon, single-pass or chunked extraction, deduplication, grouping, UPSERT-based curating, and result verification.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T12:02:35.823Z'
updatedAt: '2026-05-22T12:02:35.823Z'
---
## Reason
Capture the RLM curation workflow and constraints from the current task context.

## Raw Concept
**Task:**
Document the RLM curation approach for the current task flow.

**Changes:**
- Established the use of pre-computed recon output as the decision point for extraction mode.
- Documented the requirement to pass taskId as a bare variable to mapExtract when chunking is needed.
- Recorded the verification rule that curated file paths must be checked from result.applied[].filePath.

**Flow:**
recon -> choose extraction mode -> extract facts -> dedup/group -> curate -> verify applied file paths

**Timestamp:** 2026-05-22T12:02:26.153Z

## Narrative
### Structure
The workflow is centered on a single-pass path for small contexts and a chunked extraction path for larger contexts, with deduplication and grouping performed before curation.

### Dependencies
Depends on the pre-computed recon result, the current taskId variable, and curation helper methods for extraction and organization.

### Highlights
The context explicitly forbids re-running recon, printing raw context, and using readFile for verification. It also emphasizes UPSERT as the preferred curation operation.

## Facts
- **rlm_recon_mode**: RLM curation uses a pre-computed recon result to decide whether to use single-pass or chunked extraction. [project]
- **map_extract_timeout**: For chunked extraction, tools.curation.mapExtract() must be called with timeout: 300000 on the code_exec tool call itself. [project]
- **curation_organization_helpers**: Use tools.curation.groupBySubject() and tools.curation.dedup() to organize extracted facts. [project]
- **curation_verification**: Verify curation via result.applied[].filePath and do not call readFile for verification. [project]
