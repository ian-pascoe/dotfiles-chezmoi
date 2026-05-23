---
title: Curation Workflow Rules
summary: RLM curation workflow rules for extracting, preserving, and curating context into the knowledge tree with verification requirements.
tags: []
related: [facts/project/context.md, facts/conventions/rlm_curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md, facts/conventions/rlm_curation_approach.md, facts/project/working_module_findings_retention.md, facts/project/rlm_curation_approach.md, facts/project/rlm_curation_context.md]
keywords: []
createdAt: '2026-05-06T09:33:21.664Z'
updatedAt: '2026-05-22T16:00:17.236Z'
---
## Reason
Capture the repo-specific RLM curation workflow and constraints from the provided context.

## Raw Concept
**Task:**
Document the RLM curation workflow rules and execution constraints used for curating context into the knowledge tree.

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
- Use recon first when available
- Use mapExtract for chunked extraction when needed
- Prefer UPSERT for curation operations
- Verify applied file paths after curation
- Captured the RLM curation approach and single-pass recon guidance
- Recorded verification expectations and raw-context handling restrictions
- Preserved working module knowledge retention as a durable context rule
- Established single-pass handling for small contexts
- Defined chunked extraction flow with mapExtract for larger contexts
- Required verification of curate results through summary and applied file paths

**Flow:**
recon -> choose single-pass or chunked extraction -> curate with UPSERT -> verify result summary and applied file paths

**Timestamp:** 2026-05-22T16:00:04.872Z

**Author:** ByteRover context engineer

**Patterns:**
- `- `apply: true` must:` - Workflow rule or constraint preserved from context

## Narrative
### Structure
This context defines how to curate RLM-derived knowledge into the .brv/context-tree using UPSERT by default, with extraction and verification rules tailored to context size.

### Dependencies
Relies on tools.curation.recon, tools.curation.mapExtract, tools.curate, and history recording helpers.

### Highlights
The workflow explicitly forbids printing raw context, requires preserving factual statements, and mandates verification after curation.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon is already precomputed. Verify via result.applied[].filePath and do NOT call readFile for verification.

### Examples
Use single-pass curation for compact contexts; preserve working module findings in the knowledge base rather than leaving them only in chat history.

## Facts
- **curation_approach**: Use the RLM approach for curation tasks. [project]
- **single_pass_curation_mode**: For single-pass contexts, skip chunking entirely and curate in two code_exec calls: recon plus curate. [convention]
- **chunked_extraction_method**: For chunked contexts, use tools.curation.mapExtract for parallel extraction. [convention]
- **verification_method**: Curation operations should be verified via result.summary.failed and result.applied[].filePath. [convention]

---

## Consolidated Summary
The file captures RLM curation workflow instructions for a single-pass session, emphasizing that recon was already precomputed and should not be rerun. Key operational requirements include passing taskId as a bare variable (not a string) and using timeout 300000 on any code_exec call that includes mapExtract. Verification must be performed by checking result.applied[].filePath rather than calling readFile. The document frames the flow as precomputed recon -> extract or curate -> verify applied file paths. It notes the provided context size and that there are no messages, reinforcing that this is instruction capture rather than interactive processing. Structure includes Reason, Raw Concept, Narrative, Facts, and Consolidated Summary sections. Notable entities/patterns: RLM-based knowledge processing, mapExtract, curate result object, taskId, and filePath-based verification.

## Canonical Merge Note
This file now serves as the canonical consolidated workflow rule document. Preserve the RLM-specific guidance here and keep any future updates synchronized with this topic.
