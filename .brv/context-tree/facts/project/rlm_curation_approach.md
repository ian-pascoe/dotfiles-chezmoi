---
title: RLM Curation Approach
summary: RLM approach is the required curation method for this task, with recon already completed and single-pass mode suggested for the provided context.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T12:05:21.684Z'
updatedAt: '2026-05-22T12:05:21.684Z'
---
## Reason
Document the required curation approach from the current task

## Raw Concept
**Task:**
Curate the task instruction to use the RLM approach for curation

**Changes:**
- Specified that recon was already computed
- Specified single-pass mode
- Specified that mapExtract should be used only if chunking were needed

**Flow:**
context -> recon -> extraction -> curate -> verify

**Timestamp:** 2026-05-22T12:05:09.887Z

**Author:** user

## Narrative
### Structure
This is a workflow instruction for curation execution rather than domain content.

### Dependencies
Depends on the provided context, history, metadata, and task ID variables.

### Highlights
Reconstruction was already done, and the suggested mode is single-pass for a 847-character, 16-line context with no messages.

## Facts
- **curation_approach**: Curate using RLM approach [project]
