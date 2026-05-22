---
title: RLM Curation Workflow Rules
summary: RLM curation workflow guidance covering recon-first processing, single-pass handling for small contexts, mapExtract for chunked contexts, verification requirements, and safe curation practices.
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/curation_workflow_rules.md, facts/project/knowledge_retention_for_working_module_findings.md]
keywords: []
createdAt: '2026-05-22T10:22:30.174Z'
updatedAt: '2026-05-22T11:32:10.039Z'
---
## Reason
Curate the provided RLM curation workflow instructions and constraints

## Raw Concept
**Task:**
Document RLM curation workflow rules and operational constraints

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

**Flow:**
recon -> choose single-pass or chunked extraction -> dedup/group -> curate -> verify

**Timestamp:** 2026-05-22T11:32:02.890Z

**Author:** ByteRover context engineering instructions

**Patterns:**
- `timeout: 300000` - Required timeout for code_exec calls that contain mapExtract

## Narrative
### Structure
Defines how to handle RLM curation tasks with precomputed recon, extraction, grouping, curation, and verification steps.

### Dependencies
Depends on preloaded context/history/metadata variables and tools.curation helpers such as mapExtract, dedup, groupBySubject, and recordProgress.

### Highlights
Recon is precomputed here; single-pass is recommended for this small context; mapExtract requires timeout 300000 on the code_exec call when used; verification should use result.applied[].filePath.

### Rules
Do not print raw context. Do not call tools.curation.recon when recon has already been computed. Use tools.curation.mapExtract for chunked extraction. Verify via result.applied[].filePath and do not call readFile for verification.

## Facts
- **curation_workflow**: Curate only information with lasting value: facts, decisions, technical details, preferences, or notable outcomes. [project]
- **curation_workflow**: Conversation: [project]
- **curation_workflow**: -- [project]
- **curation_workflow**: [user]: Re-review the ast-grep plugin implementation for compliance with the approved plan after fixes. Do not edit files. Focus only on whether implementation matches the plan and previous spec findings are resolved. [project]
- **curation_workflow**: Repo: /home/ianpascoe/.local/share/chezmoi [project]
- **curation_workflow**: Relevant files: [project]
- **curation_workflow**: dot_config/opencode/plugins/ast-grep.ts [project]
- **curation_workflow**: dot_config/opencode/plugins/ast-grep/index.ts [project]
- **curation_workflow**: dot_config/opencode/plugins/ast-grep/index.test.ts [project]
- **curation_workflow**: docs/superpowers/plans/2026-05-22-opencode-ast-grep-plugin.md [project]
- **curation_workflow**: Return exactly: [project]
- **curation_workflow**: status: APPROVED or REJECTED [project]
- **curation_workflow**: findings with file/line references for any spec gaps [project]
- **curation_workflow**: residual risks if approved [project]
- **curation_workflow**: [assistant]: status: APPROVED [project]
- **curation_workflow**: findings: [project]
- **curation_workflow**: none [project]
- **curation_workflow**: residual risks if approved: [project]
- **curation_workflow**: Verification used mocked runner tests, typecheck, lint, and format check; it did not execute against a real `ast-grep` binary. [project]
- **curation_workflow**: OpenCode runtime plugin loading was not exercised; only exported hook/tool registration was tested. [project]
