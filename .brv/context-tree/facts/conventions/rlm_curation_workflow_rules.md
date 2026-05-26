---
title: RLM Curation Workflow Rules
summary: Rules and constraints for RLM-based curation, including recon-first workflow, UPSERT preference, verification requirements, and context quality standards.
tags: []
related: [facts/project/rlm_curation_approach.md, facts/project/rlm_curation_workflow.md, facts/project/context_tree_curation_workflow_rules.md, facts/project/rlm_curation_workflow.md]
keywords: []
createdAt: '2026-05-23T10:09:06.948Z'
updatedAt: '2026-05-26T17:04:33.646Z'
---
## Reason
Curate RLM context curation rules and constraints

## Raw Concept
**Task:**
Document the RLM curation workflow and constraints for context-tree maintenance

**Changes:**
- Established single-pass processing when recon recommends it
- Defined mapExtract usage with bare-variable taskId passing
- Mandated 300000 ms timeout for code_exec calls containing mapExtract
- Standardized verification on result.applied[].filePath
- Defined recon-first curation workflow
- Preserved UPSERT preference and verification rules
- Captured context quality and preservation requirements

**Flow:**
recon -> extract -> curate -> verify -> report

**Timestamp:** 2026-05-26T17:04:25.683Z

## Narrative
### Structure
Describes how to curate context using the RLM approach, including single-pass versus chunked extraction guidance and required verification steps.

### Dependencies
Depends on the context tree tooling, curation helpers, and the existing folder structure for domains and topics.

### Highlights
Emphasizes immediate execution, no confirmation prompts, UPSERT as the default operation, and preserving detailed factual content with timestamps and rules.

### Rules
Do NOT call tools.curation.recon when recon has already been precomputed. For chunked extraction, pass taskId as a bare variable, not a string. Any code_exec call containing mapExtract MUST use timeout: 300000 on the code_exec tool call itself. Verify via result.applied[].filePath; do NOT call readFile for verification.
