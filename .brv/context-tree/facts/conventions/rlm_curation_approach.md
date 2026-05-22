---
title: RLM Curation Approach
summary: RLM curation workflow with recon, single-pass handling for small contexts, mapExtract for chunked extraction, and filePath-based verification.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T11:26:02.585Z'
updatedAt: '2026-05-22T11:39:59.903Z'
---
## Reason
Capture the required RLM curation workflow and verification rules from the provided context.

## Raw Concept
**Task:**
Document the required RLM curation approach for context-to-knowledge-tree processing.

**Changes:**
- Used precomputed recon output instead of recomputing it
- Selected single-pass processing because the context is small
- Preserved constraints to avoid printing raw context and to verify via applied file paths
- Defined the preferred curation workflow with recon, extraction, curation, and verification steps
- Established UPSERT as the default curate operation
- Captured requirements for detailed, self-contained context entries
- Confirmed single-pass mode for a compact context
- Defined extraction and organization steps for any chunked cases
- Specified verification via result.applied[].filePath

**Flow:**
recon -> choose mode -> extract facts -> curate -> verify

**Timestamp:** 2026-05-22T11:39:59.900Z

**Author:** ByteRover context engineering workflow

**Patterns:**
- `^UPSERT$` - Preferred curate operation
- `^task$` - Required curation field

## Narrative
### Structure
The workflow starts with recon metadata, then uses single-pass for small contexts or mapExtract for chunked extraction, followed by UPSERT curation and verification.

### Dependencies
Depends on tools.curation.recon, tools.curation.mapExtract, tools.curation.groupBySubject, tools.curation.dedup, and tools.curate.

### Highlights
This context emphasizes not printing raw context, not calling recon again, and verifying applied file paths directly.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon is already pre-computed. Verify via result.applied[].filePath and do NOT call readFile for verification.
