---
title: RLM Curation Workflow Rules
summary: RLM curation workflow guidance for single-pass contexts, verification, and fact preservation.
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md]
keywords: []
createdAt: '2026-05-22T10:22:30.174Z'
updatedAt: '2026-05-22T11:55:29.558Z'
---
## Reason
Curate RLM context instructions and workflow rules

## Raw Concept
**Task:**
Document the RLM curation workflow guidance for this session

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
- Follow recon recommendation and proceed directly to extraction and curation

**Files:**
- dot_config/opencode/plugins/ast-grep/index.ts

**Flow:**
recon -> extract -> curate -> verify -> report

**Timestamp:** 2026-05-22T11:55:08.294Z

**Author:** ByteRover context engineer

**Patterns:**
- `timeout: 300000` - Required timeout for code_exec calls that contain mapExtract

## Narrative
### Structure
The workflow uses precomputed recon output to choose single-pass processing for small contexts and avoids unnecessary chunking.

### Dependencies
Requires verification through curate result status and applied file paths rather than read-back reads.

### Highlights
Suggested mode was single-pass with one chunk for a 1151-character context. Do not call recon again when it has already been computed.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when precomputed output exists. Use taskId as a bare variable for mapExtract when needed. Verify via result.applied[].filePath.

## Facts
- **rlm_curation_mode**: Use RLM single-pass curation when recon recommends single-pass for small contexts. [convention]
