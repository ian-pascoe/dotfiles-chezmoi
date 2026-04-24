---
title: Recall and Curation Improvements
summary: 'Recommended improvements: add recall timeout, rename curation prompt label to Conversation, and optionally log recall window size.'
tags: []
related: [architecture/opencode/byterover_recall_window_update.md, architecture/opencode/byterover_plugin_curation_and_recall.md]
keywords: []
createdAt: '2026-04-24T10:52:57.048Z'
updatedAt: '2026-04-24T10:52:57.048Z'
---
## Reason
Capture durable recommendations for improving recall startup behavior and curation labeling.

## Raw Concept
**Task:**
Document improvement recommendations for recall and curation behavior in the opencode architecture.

**Changes:**
- Add a best-effort recall timeout with AbortController
- Rename the curation prompt label to Conversation
- Consider logging recall window size for verification
- Optional: dedupe repeated curation on idle and handle oversize first-message edge cases

**Flow:**
user input -> recall on startup path -> response generation; curation uses completed turn only

**Timestamp:** 2026-04-24

**Patterns:**
- `recall using N messages / X chars` - Suggested debug log format for recall window size

## Narrative
### Structure
These recommendations apply to the opencode recall path and curation labeling, with the strongest suggestions centered on startup responsiveness and clearer terminology.

### Dependencies
Recall uses experimental.chat.system.transform, so startup latency is the main concern; curation operates on only the completed turn.

### Highlights
Highest-value items are adding a recall timeout, renaming the curation prompt label, and optionally logging recall window size. Other suggestions are lower priority unless duplicate memories or slow recalls appear.

### Rules
Do not blindly skip Do it, yes, or same; those need context. But thanks, ok, hi, etc. are probably safe to skip.

### Examples
Suggested timeout example: 5-10s best-effort. Suggested log example: recall using N messages / X chars.

## Facts
- **recall_timeout**: Add a recall timeout with AbortController because recall runs on the startup path for a response. [project]
- **curation_prompt_label**: Rename the curation prompt label from Recent conversation to Conversation because curation uses only the completed turn. [project]
- **recall_prompt_label**: Keep Recent conversation for recall because recall should include recent history. [project]
- **recall_window_logging**: Log recall window size as a debug aid using a format like recall using N messages / X chars. [project]
- **recall_timeout_duration**: A 5-10 second best-effort timeout would prevent the agent from feeling stuck during recall. [project]
- **trivial_recall_heuristic**: Consider skipping recall for trivial latest user messages only when they are not referential. [project]
- **short_message_handling**: Avoid blindly skipping short messages like Do it, yes, or same because they may need context. [project]
- **first_message_budget_edge_case**: Fixing the first-message-over-budget edge case is optional because current behavior intentionally includes the newest formatted message even if it exceeds 4096 chars. [project]
- **idle_deduplication**: Avoid repeated curation on idle by tracking the last curated message or turn ID. [project]
