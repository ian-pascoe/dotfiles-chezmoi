---
title: Curation Workflow Rules
summary: RLM curation workflow rules, verification expectations, and best-effort retention guidance for working module findings
tags: []
related: [facts/project/context.md, facts/conventions/rlm_curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md, facts/conventions/rlm_curation_approach.md, facts/project/working_module_findings_retention.md]
keywords: []
createdAt: '2026-05-06T09:33:21.664Z'
updatedAt: '2026-05-22T11:27:35.143Z'
---
## Reason
Curate the provided RLM workflow rules and project facts into durable knowledge

## Raw Concept
**Task:**
Document the curation workflow rules and retention guidance for the working module

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

**Flow:**
context provided -> recon computed -> single-pass extraction -> curate durable knowledge -> verify applied file paths

**Timestamp:** 2026-05-22T11:27:25.991Z

**Author:** ByteRover context engineer

**Patterns:**
- `- `apply: true` must:` - Workflow rule or constraint preserved from context

## Narrative
### Structure
This knowledge captures the workflow rules used when curating context: use the precomputed recon result, proceed in single-pass mode for small contexts, and keep the extracted content durable in the context tree.

### Dependencies
Relies on the RLM curation process, the task id for extraction operations, and the curate result summary for verification.

### Highlights
The rules emphasize not printing raw context, not reading files just to verify curate outcomes, and retaining working module findings as durable knowledge.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon is already precomputed. Verify via result.applied[].filePath and do NOT call readFile for verification.

### Examples
Use single-pass curation for compact contexts; preserve working module findings in the knowledge base rather than leaving them only in chat history.

## Facts
- **curation_approach**: The context uses an RLM approach for curation. [convention]
- **recon_mode**: Recon has already been computed and suggested single-pass mode for this context. [convention]
- **raw_context_printing**: The context explicitly forbids printing raw context during curation. [convention]
- **verification_method**: Verification should use result.applied[].filePath and must not call readFile for verification. [convention]
- **working_module_findings_retention**: Working module findings should be preserved as durable knowledge instead of chat-only context. [project]
- **processing_policy**: Best-effort processing is preferred over perfect completeness when curating working module findings. [convention]

---

## Consolidated Summary
The file captures RLM curation workflow instructions for a single-pass session, emphasizing that recon was already precomputed and should not be rerun. Key operational requirements include passing taskId as a bare variable (not a string) and using timeout 300000 on any code_exec call that includes mapExtract. Verification must be performed by checking result.applied[].filePath rather than calling readFile. The document frames the flow as precomputed recon -> extract or curate -> verify applied file paths. It notes the provided context size and that there are no messages, reinforcing that this is instruction capture rather than interactive processing. Structure includes Reason, Raw Concept, Narrative, Facts, and Consolidated Summary sections. Notable entities/patterns: RLM-based knowledge processing, mapExtract, curate result object, taskId, and filePath-based verification.

## Canonical Merge Note
This file now serves as the canonical consolidated workflow rule document. Preserve the RLM-specific guidance here and keep any future updates synchronized with this topic.
