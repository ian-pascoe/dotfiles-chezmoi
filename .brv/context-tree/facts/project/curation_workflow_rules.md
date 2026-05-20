---
title: Curation Workflow Rules
summary: "Curation workflow rules: use RLM approach, recon first, single-pass for small contexts, mapExtract for chunked extraction, verify curate results, and preserve facts and temporal markers."
tags: []
related:
  [facts/project/curation_workflow_rules.md, facts/conventions/rlm_curation_workflow_rules.md]
keywords: []
createdAt: "2026-05-06T09:33:21.664Z"
updatedAt: "2026-05-20T16:06:53.173Z"
consolidated_at: "2026-05-20T16:22:04.058Z"
consolidated_from:
  [
    {
      date: "2026-05-20T16:22:04.058Z",
      path: facts/conventions/rlm_curation_workflow_rules.md,
      reason: "These two files describe the same RLM curation workflow rules with highly overlapping content: precomputed recon, single-pass for small contexts, mapExtract for chunked extraction, taskId/timeout constraints, and verification via result.applied[].filePath. The project version is richer and more complete, so it should be the merge target.",
    },
  ]
---

## Reason

Persist compact curation workflow rules from the provided context

## Raw Concept

**Task:**
Document the curation workflow for RLM-based processing of compact contexts

**Changes:**

- Recorded that recon was precomputed and suggested single-pass mode
- Captured taskId and timeout requirements for mapExtract usage
- Captured verification rule for curate results
- Captured single-pass execution guidance for small contexts
- Captured chunked extraction guidance using mapExtract
- Captured UPSERT preference and verification constraints
- Captured recon-driven single-pass workflow
- Captured chunked extraction workflow with mapExtract, dedup, and groupBySubject
- Captured UPSERT preference and verification guidance
- Established that recon may already be computed and should be reused
- Specified single-pass processing without chunking
- Set timeout requirement for mapExtract-containing code_exec calls
- Defined verification by applied file paths only
- Captured precomputed recon guidance for a 526-character context
- Recorded the single-pass recommendation for small contexts
- Recorded verification guidance using curate results instead of readFile

**Flow:**
recon already computed -> skip recon -> proceed directly to extraction -> curate -> verify via applied file paths

**Timestamp:** 2026-05-20T16:06:46.831Z

**Author:** ByteRover context engineer

## Narrative

### Structure

This context defines a compact curation workflow with explicit instructions for single-pass handling, chunked extraction fallback, and result-based verification.

### Dependencies

Depends on precomputed recon metadata and the curation tool output structure.

### Highlights

The context explicitly says not to print raw context, not to call tools.curation.recon again, and to use the taskId variable as a bare variable when needed.

### Rules

IMPORTANT: Do NOT print raw context. Do NOT call tools.curation.recon — it has been pre-computed. Proceed directly to extraction. For chunked extraction use tools.curation.mapExtract(). Pass taskId as a bare variable, not a string. Use tools.curation.groupBySubject() and tools.curation.dedup() to organize extractions. Verify via result.applied[].filePath — do NOT call readFile for verification.

## Facts

- **curation_approach**: Curation tasks should use the RLM approach. [convention]
- **curation_mode**: For compact contexts, suggestedMode can be single-pass. [convention]
- **chunked_extraction_tool**: When extraction is needed for chunked contexts, use tools.curation.mapExtract(). [convention]
- **verification_method**: Curation verification should use result.applied[].filePath and not readFile for verification. [convention]
- **rlm_curate_mode**: RLM curate workflow for small contexts uses single-pass mode after recon. [convention]
- **mapextract_task_id**: For chunked extraction, mapExtract requires taskId passed as a bare variable. [convention]
- **mapextract_timeout**: Any code_exec call containing mapExtract must use timeout 300000 on the tool call itself. [convention]

## Consolidated Summary

The file captures RLM curation workflow instructions for a single-pass session, emphasizing that recon was already precomputed and should not be rerun. Key operational requirements include passing taskId as a bare variable (not a string) and using timeout 300000 on any code_exec call that includes mapExtract. Verification must be performed by checking result.applied[].filePath rather than calling readFile. The document frames the flow as precomputed recon -> extract or curate -> verify applied file paths. It notes the provided context size and that there are no messages, reinforcing that this is instruction capture rather than interactive processing. Structure includes Reason, Raw Concept, Narrative, Facts, and Consolidated Summary sections. Notable entities/patterns: RLM-based knowledge processing, mapExtract, curate result object, taskId, and filePath-based verification.
