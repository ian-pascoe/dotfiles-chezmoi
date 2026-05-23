---
title: Context Tree Curation Workflow Rules
summary: 'Repository curation workflow rules: use recon first, single-pass for small contexts, mapExtract for chunked contexts, curate with UPSERT, verify via result.summary and applied file paths.'
tags: []
related: []
keywords: []
createdAt: '2026-05-23T09:53:07.726Z'
updatedAt: '2026-05-23T09:53:07.727Z'
---
## Reason
Curate the RLM curation workflow and repo verification rules from the provided context.

## Raw Concept
**Task:**
Document the curation workflow rules for RLM-based context processing.

**Changes:**
- Captured single-pass and chunked curation decision rules
- Recorded verification and result-checking requirements
- Documented UPSERT as the preferred curate operation

**Flow:**
recon -> decide single-pass or chunked -> curate -> verify summary and applied file paths

**Timestamp:** 2026-05-23T09:52:56.252Z

## Narrative
### Structure
The workflow centers on precomputed recon results, with single-pass used for small contexts and mapExtract reserved for chunked extraction.

### Dependencies
Depends on sandbox variables for context, history, metadata, and task ID, plus tools.curation helpers and tools.curate.

### Highlights
The context emphasizes not printing raw context, using UPSERT by default, and confirming success via result.summary.failed and applied file paths.

## Facts
- **curation_recon_step**: For RLM curation tasks, always start with tools.curation.recon to assess metadata, history, and previews. [project]
- **single_pass_mode**: When recon suggests single-pass, skip chunking and curate in two code_exec calls: recon and curate. [project]
- **chunked_mode**: When recon suggests chunked, use tools.curation.mapExtract with chunking and process chunks in parallel. [project]
- **preferred_curate_operation**: Use tools.curate with UPSERT as the preferred curation operation. [project]
- **curation_verification**: After curation, verify that result.summary.failed equals 0. [project]
- **verification_method**: Use result.applied[].filePath for verification instead of reading files back. [project]
