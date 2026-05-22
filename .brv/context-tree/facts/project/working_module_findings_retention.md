---
title: Working Module Findings Retention
summary: Working module findings should be retained as durable knowledge in the context tree instead of remaining chat-only context.
tags: []
related: [facts/conventions/rlm_curation_workflow_rules.md, facts/project/working_module_findings_retention.md, facts/conventions/rlm_curation_approach.md]
keywords: []
createdAt: '2026-05-22T10:37:33.249Z'
updatedAt: '2026-05-22T11:50:40.690Z'
---
## Reason
Curate the working module findings retention guidance from the provided context

## Raw Concept
**Task:**
Document the rule that working module findings must be retained in durable knowledge storage.

**Changes:**
- Stored working module findings beyond chat-only context
- Curated findings into the context tree
- Applied bounded-best-effort processing rather than perfect completeness
- Use recon before extraction for curation tasks
- Use mapExtract for chunked or structured extraction when needed
- Deduplicate extracted facts before curating
- Verify curation by checking applied file paths
- Preserve findings as durable knowledge rather than chat-only context
- Curate findings into the context tree for later recall
- Use the RLM approach for extraction and curation
- Established retention of working module findings as curated knowledge

**Flow:**
findings identified -> preserved as knowledge -> curated into context tree

**Timestamp:** 2026-05-22T11:50:34.068Z

**Author:** ByteRover context engineering workflow

## Narrative
### Structure
This knowledge captures the retention policy for working module findings within the project context tree.

### Dependencies
Depends on the RLM curation workflow and the existing context tree structure.

### Highlights
The key outcome is that useful findings are not left only in conversation history; they are preserved in durable knowledge.

### Rules
Preserve working module findings as durable knowledge instead of chat-only context.

## Facts
- **working_module_findings_retention**: Working module findings should be preserved as durable knowledge rather than chat-only context. [project]
- **working_module_findings_curation**: The findings should be curated into the context tree. [project]
