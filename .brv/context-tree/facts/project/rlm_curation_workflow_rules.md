---
title: RLM Curation Workflow Rules
summary: 'Rules for curating with RLM: use recon, single-pass for small contexts, preserve facts, curate durable knowledge, and verify success.'
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md]
keywords: []
createdAt: '2026-05-22T10:22:30.174Z'
updatedAt: '2026-05-22T11:05:59.473Z'
---
## Reason
Curate the current curation workflow rules and best-effort retention guidance

## Raw Concept
**Task:**
Document the RLM curation workflow rules and the instruction to preserve working module findings as durable knowledge.

**Changes:**
- Captured recon-guided single-pass behavior for small contexts
- Captured chunked extraction behavior and taskId handling
- Captured curation verification requirements
- Use precomputed recon instead of recomputing it
- Proceed directly to extraction for single-pass contexts
- Use mapExtract for chunked extraction with timeout 300000 on code_exec calls that invoke it
- Verify curation success via result.applied[].filePath
- Capture the instruction to proceed directly to extraction when recon is already computed
- Preserve the single-pass path for small contexts
- Preserve the chunked extraction and verification rules
- Recorded that recon was already computed before curation
- Captured the single-pass recommendation
- Preserved context size and verification constraints
- Captured the recommended RLM workflow for curation
- Recorded the single-pass decision for small contexts
- Recorded verification requirements and durable knowledge retention guidance

**Flow:**
recon -> single-pass or chunked extraction -> curate -> verify applied file paths -> record progress

**Timestamp:** 2026-05-22T11:05:47.720Z

**Author:** ByteRover context engineer

**Patterns:**
- `timeout: 300000` - Required timeout for code_exec calls that contain mapExtract

## Narrative
### Structure
This context describes the operational rules for curation: start with recon, use single-pass when suggested, otherwise extract with mapExtract, then curate and verify using applied file paths.

### Dependencies
Depends on the RLM curation helpers and the history tracking mechanism for recording progress.

### Highlights
The workflow emphasizes bounded effort, durable knowledge retention, and verification without extra file reads.

### Rules
Do not print raw context. Do not call tools.curation.recon when recon has already been computed. Use tools.curation.mapExtract for chunked extraction. Verify via result.applied[].filePath and do not call readFile for verification.

## Facts
- **curation_recon_step**: Use tools.curation.recon before processing curation contexts. [convention]
- **single_pass_mode**: If recon suggests single-pass, skip chunking entirely for small contexts. [convention]
- **mapextract_taskid_usage**: For chunked contexts, use tools.curation.mapExtract with taskId passed as a bare variable. [convention]
- **verification_method**: Verify curation via result.applied[].filePath and do not call readFile for verification. [convention]
- **durable_knowledge_retention**: Curate durable knowledge instead of leaving it as chat-only context. [project]
- **working_module_findings**: Preserve working module findings as durable knowledge in the context tree. [project]
