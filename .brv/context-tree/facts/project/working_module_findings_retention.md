---
title: Working Module Findings Retention
summary: Working module findings should be retained as durable knowledge with recon-first, extract, dedup, curate, and verify workflow rules.
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/working_module_findings_retention.md]
keywords: []
createdAt: '2026-05-22T10:37:33.249Z'
updatedAt: '2026-05-22T10:51:05.163Z'
---
## Reason
Persist durable findings from the working module context using RLM curation workflow

## Raw Concept
**Task:**
Curate working module findings into durable context-tree knowledge

**Changes:**
- Stored working module findings beyond chat-only context
- Curated findings into the context tree
- Applied bounded-best-effort processing rather than perfect completeness
- Use recon before extraction for curation tasks
- Use mapExtract for chunked or structured extraction when needed
- Deduplicate extracted facts before curating
- Verify curation by checking applied file paths

**Flow:**
recon -> extract -> dedup/group -> curate -> verify

**Timestamp:** 2026-05-22T10:50:56.391Z

**Author:** ByteRover context engineer

## Narrative
### Structure
Curation workflow is organized around RLM processing with durable knowledge retention in the context tree.

### Dependencies
Relies on tools.curation.recon, tools.curation.mapExtract, tools.curation.dedup, tools.curation.groupBySubject, and tools.curate.

### Highlights
The working module findings are preserved as durable knowledge rather than chat-only context.

### Rules
Always start curation with recon when required by the workflow. Do not print raw context. Verify success via result.summary and applied file paths.
