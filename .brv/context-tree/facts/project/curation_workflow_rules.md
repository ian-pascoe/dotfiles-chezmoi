---
consolidated_at: '2026-05-26T17:27:01.063Z'
consolidated_from: [{date: '2026-05-26T17:27:01.063Z', path: facts/project/context_tree_curation_workflow_rules.md, reason: 'These two project-level workflow documents overlap heavily and cover the same repo curation rules, verification requirements, and UPSERT preference. The canonical workflow-rules file should absorb the context-tree-specific file.'}]
---
# Title: Curation Workflow Rules

This document defines the repo-specific RLM curation workflow and constraints used for curating context into the knowledge tree.

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

## Additional preserved convention details
- Use precomputed recon when available and do not rerun it.
- Any code_exec call containing mapExtract must use timeout: 300000.
- taskId must be passed as a bare variable when using mapExtract.
- Do not print raw context to stdout.
