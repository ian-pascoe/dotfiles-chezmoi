---
title: RLM Curation Workflow Rules
summary: 'RLM curation workflow rules: use recon first, single-pass for small contexts, mapExtract for chunked contexts, then dedup, group, curate, and verify failed===0.'
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md]
keywords: []
createdAt: '2026-05-22T10:22:30.174Z'
updatedAt: '2026-05-22T11:37:46.987Z'
---
## Reason
Curate extracted curation workflow rules and project facts from the provided RLM context

## Raw Concept
**Task:**
Document the RLM curation workflow rules and execution pattern for context engineering.

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
- Preserved working-module findings as durable knowledge
- Capture recon-first workflow guidance
- Preserve single-pass vs chunked extraction decision rules
- Record verification and curation safety requirements
- Captured recon-first workflow for curation tasks
- Captured single-pass and chunked processing guidance
- Captured verification and output handling rules

**Flow:**
recon -> decide single-pass or chunked -> extract if needed -> curate with UPSERT -> verify result.summary.failed === 0 -> report status

**Timestamp:** 2026-05-22T11:37:33.530Z

**Author:** ByteRover context engineering guidance

**Patterns:**
- `timeout: 300000` - Required timeout for code_exec calls that contain mapExtract

## Narrative
### Structure
This knowledge sits in facts/project because it describes operating rules for curation workflow rather than a product feature. The workflow distinguishes single-pass handling for small contexts from chunked extraction for larger ones.

### Dependencies
Depends on tools.curation.recon, tools.curation.mapExtract, tools.curation.dedup, tools.curation.groupBySubject, and tools.curate.

### Highlights
The process is optimized for small contexts by skipping unnecessary chunking, and it requires post-curation verification with failed equal to zero.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon is already computed. Verify via result.applied[].filePath and do NOT call readFile for verification.

## Facts
- **curation_recon_step**: Use recon first to assess metadata, history, and preview before curation. [convention]
- **single_pass_mode**: When recon suggests single-pass, skip chunking and curate in two code_exec calls: recon plus curate. [convention]
- **map_extract_chunked_mode**: For chunked contexts, use tools.curation.mapExtract with chunkSize 8000 and process chunks in parallel. [convention]
- **curate_operation_default**: Always use UPSERT by default for curation operations. [convention]
- **curation_verification_rule**: After curation, verify that result.summary.failed equals 0. [convention]
- **no_raw_context_printing**: Do not print raw context during curate mode because stdout is capped. [convention]
- **verification_method**: For verification, rely on result.applied[].filePath and do not call readFile. [convention]
