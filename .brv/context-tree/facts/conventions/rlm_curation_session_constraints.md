---
title: RLM Curation Session Constraints
summary: This session required single-pass processing, no raw context printing, and verification via result.applied file paths.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T15:45:15.236Z'
updatedAt: '2026-05-22T15:45:15.236Z'
---
## Reason
Persist the session-specific curation and verification constraints observed in the task context

## Raw Concept
**Task:**
Capture the operating constraints for this RLM curation session

**Changes:**
- Recorded the precomputed recon outcome
- Recorded the no-raw-context and no-recon-call constraints
- Recorded the verification requirement using curate results only

**Flow:**
precomputed recon -> direct extraction or curation -> verify via result.applied file paths

**Timestamp:** 2026-05-22T15:44:43.588Z

**Author:** assistant report

## Narrative
### Structure
These constraints govern how the curation step is executed and verified in this session.

### Dependencies
Bound to the task-specific context variables, history variable, metadata variable, and task ID supplied by the orchestration layer.

### Highlights
The task explicitly requested RLM curation and required direct progression without further confirmation.

### Rules
IMPORTANT: Do NOT print raw context. Do NOT call tools.curation.recon — it has been pre-computed. Proceed directly to extraction. For chunked extraction use tools.curation.mapExtract(). Pass taskId as a bare variable, not a string. Verify via result.applied[].filePath — do NOT call readFile for verification.

### Examples
The prompt also instructed to return one of DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED for the underlying implementation task.

## Facts
- **recon_mode**: Recon was already computed and suggested single-pass mode with 4676 characters, 72 lines, and zero messages [convention]
- **no_recon_call**: Do not call tools.curation.recon because it was pre-computed [convention]
- **no_raw_context_printing**: Do not print raw context [convention]
- **mapextract_timeout**: For any code_exec call containing mapExtract, set the tool-call timeout to 300000 [convention]
- **verification_method**: Verification must use result.applied[].filePath and must not call readFile for verification [convention]
