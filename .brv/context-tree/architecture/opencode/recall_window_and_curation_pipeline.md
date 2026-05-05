---
title: Recall Window and Curation Pipeline
summary: Guidance for curation workflow emphasizing recon, extraction, UPSERT-based updates, and verification of applied file paths.
tags: []
related: [architecture/opencode/byterover_context_engine_ideas.md, architecture/opencode/byterover_plugin_curation_and_recall.md, architecture/opencode/recall_and_curation_improvements.md, architecture/opencode/recall_window_and_curation_pipeline.md]
keywords: []
createdAt: '2026-05-05T15:35:12.673Z'
updatedAt: '2026-05-05T16:58:10.270Z'
---
## Reason
Curate recalled guidance about the curation workflow and verification practices.

## Raw Concept
**Task:**
Document curation workflow guidance for context-tree updates

**Changes:**
- Prefer curated context retrieval from the recent conversation only.
- Limit recall scope to a recent window of up to 3 user turns or 4096 characters.
- Keep curation prompt label as Conversation and inject recall later during system transform.
- Use best-effort recall with an abort/timeout safeguard instead of blocking the agent.
- Defined recall scope as a recent window limited to up to 3 user turns or 4096 characters
- Established that recall should be best-effort and responsiveness-safe with an abort/timeout safeguard
- Specified that curation remains current-turn only
- Kept the curation prompt label as Conversation and inject recall later during system transform
- Use recon before extraction when applicable
- Prefer single-pass processing for small contexts
- Verify curate results through applied file paths

**Flow:**
recon -> extract -> curate -> verify

**Timestamp:** 2026-05-05T16:58:04.549Z

**Author:** ByteRover

**Patterns:**
- `^3$` - Recent recall window turns limit
- `^4096$` - Recent recall window character limit

## Narrative
### Structure
The guidance describes an RLM-based curation workflow for compact contexts and emphasizes using UPSERT for updates.

### Dependencies
Relies on curated context variables, history tracking, and verification of applied file paths after curation.

### Highlights
Single-pass curation is appropriate for small contexts. Verification should use result.applied[].filePath rather than rereading files.

### Rules
Recall should be best-effort and responsiveness-safe, using an abort/timeout safeguard instead of blocking the agent. Context recall should use the recent conversation only, resolve references from it, and extract reusable implementation ideas rather than restating the query.
