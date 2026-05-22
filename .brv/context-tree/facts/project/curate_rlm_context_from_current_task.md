---
title: Curate RLM context from current task
summary: RLM curation workflow context with extraction, grouping, deduplication, and verification requirements for the current task.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T11:54:28.682Z'
updatedAt: '2026-05-22T11:54:28.682Z'
---
## Reason
Persist extracted facts from the provided RLM context

## Raw Concept
**Task:**
Curate the provided RLM context into durable knowledge

**Changes:**
- Captured the required variable names and task metadata
- Recorded the precomputed recon recommendation
- Stored the extraction and verification instructions as durable facts

**Flow:**
Provided context -> precomputed recon -> single-pass curation -> verify applied file paths

**Timestamp:** 2026-05-22T11:54:16.390Z

## Narrative
### Structure
This knowledge records the RLM curation setup for a single-pass task using injected context, history, metadata, and task-id variables.

### Dependencies
Depends on the precomputed recon result and the curation helpers for grouping, deduplication, and verification.

### Highlights
Single-pass mode is recommended for this compact context; chunking is unnecessary.

### Rules
Do not print raw context. Do not call tools.curation.recon because it was already computed. Use the bare taskId variable when needed.

## Facts
- **curation_approach**: The current task uses the RLM curation approach. [convention]
- **context_variable**: The context variable name is __curate_ctx_0f8d4f75_d28b_4725_8f0a_b96e8f3fd3b3. [project]
- **history_variable**: The history variable name is __curate_hist_0f8d4f75_d28b_4725_8f0a_b96e8f3fd3b3. [project]
- **metadata_variable**: The metadata variable name is __curate_meta_0f8d4f75_d28b_4725_8f0a_b96e8f3fd3b3. [project]
- **task_id_variable**: The task ID variable name is __taskId_0f8d4f75_d28b_4725_8f0a_b96e8f3fd3b3. [project]
- **suggested_mode**: The precomputed recon result says suggestedMode is single-pass. [project]
- **suggested_chunk_count**: The precomputed recon result says suggestedChunkCount is 1. [project]
- **context_size**: The precomputed recon result says the context has 1583 characters and 28 lines. [project]
- **extraction_organization**: The curation instructions require using tools.curation.groupBySubject() and tools.curation.dedup() to organize extractions. [convention]
- **verification_method**: Verification must use result.applied[].filePath and must not call readFile for verification. [convention]
