---
title: RLM Curation Workflow Rules
summary: RLM curation workflow rules emphasizing precomputed recon, single-pass execution, mapExtract timeout requirements, and verification via applied file paths.
tags: []
related: [facts/project/curation_workflow_rules.md, facts/project/rlm_curation_workflow_rules.md]
keywords: []
createdAt: '2026-05-22T10:11:28.941Z'
updatedAt: '2026-05-22T11:58:23.149Z'
---
## Reason
Capture the explicit curation workflow constraints from the current task instructions.

## Raw Concept
**Task:**
Curate the explicit RLM workflow instructions for the current task.

**Changes:**
- Accepted precomputed recon results for the current curation task
- Recorded single-pass handling for small contexts
- Recorded timeout and verification constraints for mapExtract-driven curation
- Use precomputed recon to choose single-pass or chunked extraction
- Use tools.curation.mapExtract with taskId for chunked contexts
- Verify curate results via applied file paths and failed counts
- Preserved the single-pass versus chunked extraction decision rule
- Captured the requirement to verify curation via result.applied[].filePath
- Recorded the instruction to update history after curation
- Captured precomputed recon guidance and single-pass execution rules
- Captured extraction, deduplication, grouping, and verification requirements
- Captured timeout and taskId handling for mapExtract-based chunked extraction
- Documented the workflow constraints and verification requirements from the task context.

**Flow:**
recon precomputed -> single-pass extraction -> curate -> verify via applied file paths

**Timestamp:** 2026-05-22T11:58:06.832Z

**Author:** ByteRover context engineering instructions

## Narrative
### Structure
The instructions define how to process curated context in RLM mode, including when to skip recon, when to use mapExtract, and how to verify results.

### Dependencies
Depends on the precomputed recon result, sandbox variables for context/history/metadata, and tools.curate verification output.

### Highlights
Curate only information with lasting value: facts, decisions, technical details, preferences, or notable outcomes. | `ast-grep --debug-query` writes the useful debug tree to `stderr`. | It can also exit non-zero. | The plugin was using the common `runAstGrep` helper, which treats any non-zero exit as an error, so OpenCode showed the tool call as an error before the wrapper return could happen. | `ast_grep_debug_pattern` now invokes the runner directly. | It treats `stderr || stdout` as successful debug output when present. | Targeted regression failed first, then passed. | `npm run typecheck --workspace dot_config/opencode` | `npm run lint --workspace dot_config/opencode` | `npm run format:check --workspace dot_config/opencode`

### Rules
It only throws if there is no debug output and the exit code is non-zero.

### Examples
Example verification: inspect result.applied[].filePath after tools.curate(); do not read back the file for confirmation.

## Facts
- **rlm_curation_mode**: Curate using RLM approach with precomputed recon and single-pass execution when suggestedMode is single-pass. [convention]
- **recon_usage**: Do not call tools.curation.recon when recon is already precomputed. [convention]
- **mapextract_timeout_taskid**: For chunked extraction, mapExtract must use taskId as a bare variable and code_exec timeout must be 300000. [convention]
- **verification_method**: Verification should use result.applied[].filePath and must not call readFile for verification. [convention]
- **context_variable**: The context variable is __curate_ctx_f5ace101_acaf_4ce2_8408_1a6fc94e1f69. [project]
- **history_variable**: The history variable is __curate_hist_f5ace101_acaf_4ce2_8408_1a6fc94e1f69. [project]
- **metadata_variable**: The metadata variable is __curate_meta_f5ace101_acaf_4ce2_8408_1a6fc94e1f69. [project]
- **task_id_variable**: The task ID variable is __taskId_f5ace101_acaf_4ce2_8408_1a6fc94e1f69. [project]
