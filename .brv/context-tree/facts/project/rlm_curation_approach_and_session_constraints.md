---
consolidated_at: '2026-05-27T11:28:01.681Z'
consolidated_from: [{date: '2026-05-27T11:28:01.681Z', path: facts/project/rlm_curation_approach_and_session_constraints.abstract.md, reason: Abstract and full version cover the same guidance; merging yields a single canonical file.}]
---
# Title: RLM Curation Approach and Session Constraints

## Reason
Curate the provided RLM curation guidance and session constraints into durable knowledge.

## Raw Concept
**Task:** Document the RLM curation workflow, processing modes, and verification requirements for session‑based context curation.

**Changes:**
- Captured the precomputed recon recommendation and extraction guidance.
- Recorded timeout and verification requirements for curation calls.
- Preserved the instruction to avoid printing raw context.
- Established recon‑first workflow for curation tasks.
- Defined single‑pass processing for small contexts.
- Defined chunked extraction flow using mapExtract for larger contexts.
- Specified inline verification using curate results.

**Files:**
- .brv/context-tree/facts/project/context.md

**Flow:** recon → select single‑pass or chunked extraction → curate UPSERTs → verify `result.summary.failed` and applied file paths.

**Timestamp:** 2026‑05‑22

**Author:** ByteRover context engineering guidance

## Narrative
### Structure
The guidance defines an RLM workflow with a required reconnaissance step, then branching into either single‑pass curation for small inputs or chunked extraction for larger ones.

### Dependencies
Depends on sandbox variables for context, history, metadata, and task id; uses `tools.curation.recon`, `mapExtract`, `dedup`, `groupBySubject`, and `tools.curate`.

### Highlights
- Recon was already precomputed for this session and indicated single‑pass mode.
- The workflow emphasizes preserving facts, avoiding raw context output, and verifying curation success from the result object.

### Rules
- Do not print raw context.
- Do not call `tools.curation.recon` when recon has already been precomputed.
- For chunked extraction, pass `taskId` as a bare variable.
- Use timeout `300000` on any `code_exec` call that includes `mapExtract`.
- Verify via `result.applied[].filePath` and do not call `readFile`.

## Facts
- **rlm_mode_selection:** Single‑pass mode should be used when recon suggests a small context and chunking is unnecessary. [convention]
- **recon_function:** `tools.curation.recon` provides metadata, history, head/tail previews, and a suggested processing mode. [convention]
- **map_extract_chunking:** If recon suggests chunked processing, `tools.curation.mapExtract` should be used with a chunk size around 8000 characters. [convention]
- **curate_verification:** Curate operations should be verified by checking `result.summary.failed` and `result.applied[].filePath`. [convention]
- **stdout_constraint:** RLM curation context should not print raw context to stdout. [convention]

*(All original sections, examples, and additional preserved convention details are retained verbatim.)