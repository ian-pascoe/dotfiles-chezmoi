---
title: Curation Workflow Rules
summary: RLM curation workflow rules covering reconnaissance, extraction, chunking, verification, UPSERT preference, and preservation requirements.
tags: []
related: [facts/project/context.md, facts/conventions/rlm_curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md]
keywords: []
createdAt: '2026-05-06T09:33:21.664Z'
updatedAt: '2026-05-22T10:17:26.784Z'
---
## Reason
Preserve the workflow rules and constraints described in the RLM curation context

## Raw Concept
**Task:**
Document the RLM curation workflow rules and operating constraints used for context-tree curation.

**Changes:**
- Recorded that recon was precomputed and suggested single-pass mode
- Captured taskId and timeout requirements for mapExtract usage
- Captured verification rule for curate results
- Captured single-pass execution guidance for small contexts
- Captured chunked extraction guidance using mapExtract, dedup, and groupBySubject
- Captured UPSERT preference and verification constraints
- Established that recon may already be computed and should be reused
- Specified single-pass processing without chunking
- Set timeout requirement for mapExtract-containing code_exec calls
- Defined verification by applied file paths only
- Captured precomputed recon guidance for a 526-character context
- Recorded the single-pass recommendation for small contexts
- Recorded verification guidance using curate results instead of readFile
- Specified UPSERT as the preferred default operation
- Defined the RLM query and curation workflows
- Captured bounded-best-effort processing guidance
- Captured the requirement to use RLM curation mode with precomputed recon when available.
- Preserved rules for using UPSERT by default, avoiding unnecessary file reads, and verifying via applied file paths.
- Recorded the requirement to use mapExtract for chunked contexts and to keep raw context out of console output.
- Captured the recommended single-pass handling for small contexts
- Recorded the required mapExtract timeout rule
- Preserved the verification rule that relies on applied file paths

**Flow:**
recon -> choose single-pass or chunked extraction -> curate via UPSERT -> verify applied file paths -> record progress

**Timestamp:** 2026-05-22T10:17:05.230Z

**Author:** ByteRover context engineer

**Patterns:**
- `^timeout:\s*300000$` - Required timeout for code_exec calls containing mapExtract

## Narrative
### Structure
The workflow distinguishes between single-pass and chunked curation based on recon output, then applies UPSERT-based curation and verifies success from the curate result.

### Dependencies
Relies on tools.curation.recon, mapExtract, dedup, groupBySubject, and tools.curate.

### Highlights
The context emphasizes preservation of exact workflow constraints, no raw context printing, and direct verification from curate results.

### Rules
Recon already computed must be respected.
Do not call tools.curation.recon again when precomputed recon is provided.
If suggestedMode is single-pass, skip chunking entirely.
Any code_exec call containing mapExtract MUST use timeout: 300000 on the code_exec tool call itself.
Use tools.curation.groupBySubject() and tools.curation.dedup() to organize extractions.
Verify via result.applied[].filePath — do NOT call readFile for verification.
UPSERT is preferred over ADD, UPDATE, and MERGE.

### Examples
When a context is small, use single-pass processing after recon. When a context is chunked, use tools.curation.mapExtract with the provided taskId and then deduplicate/group facts before curating.

## Facts
- **curation_reconnaissance**: Reconnaissance must be performed first for curation tasks, unless recon has already been computed and provided. [convention]
- **single_pass_curation**: For single-pass contexts, chunking should be skipped entirely. [convention]
- **map_extract_task_id**: When chunked extraction is needed, tools.curation.mapExtract() should be used with taskId passed as a bare variable. [convention]
- **map_extract_timeout**: Any code_exec call containing mapExtract must use timeout: 300000 on the code_exec tool call itself. [convention]
- **dedup_and_grouping**: tools.curation.groupBySubject() and tools.curation.dedup() should be used to organize extractions. [convention]
- **verification_method**: Verification should use result.applied[].filePath and should not call readFile for verification. [convention]
- **upsert_preference**: UPSERT is the preferred curation operation over ADD, UPDATE, or MERGE when creating or updating knowledge. [convention]

---

## Consolidated Summary
The file captures RLM curation workflow instructions for a single-pass session, emphasizing that recon was already precomputed and should not be rerun. Key operational requirements include passing taskId as a bare variable (not a string) and using timeout 300000 on any code_exec call that includes mapExtract. Verification must be performed by checking result.applied[].filePath rather than calling readFile. The document frames the flow as precomputed recon -> extract or curate -> verify applied file paths. It notes the provided context size and that there are no messages, reinforcing that this is instruction capture rather than interactive processing. Structure includes Reason, Raw Concept, Narrative, Facts, and Consolidated Summary sections. Notable entities/patterns: RLM-based knowledge processing, mapExtract, curate result object, taskId, and filePath-based verification.

## Canonical Merge Note
This file now serves as the canonical consolidated workflow rule document. Preserve the RLM-specific guidance here and keep any future updates synchronized with this topic.
