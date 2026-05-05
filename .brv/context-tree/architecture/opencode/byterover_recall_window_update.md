---
consolidated_at: '2026-05-05T15:55:10.729Z'
consolidated_from: [{date: '2026-05-05T15:55:10.729Z', path: architecture/opencode/byterover_recall_window_update.overview.md, reason: 'These are the same recall-window update in source, overview, and abstract form. The overview and abstract duplicate the markdown source rather than add complementary content.'}, {date: '2026-05-05T15:55:10.729Z', path: architecture/opencode/byterover_recall_window_update.abstract.md, reason: 'These are the same recall-window update in source, overview, and abstract form. The overview and abstract duplicate the markdown source rather than add complementary content.'}]
related: [architecture/opencode/byterover_context_engine_ideas.md, architecture/opencode/byterover_plugin_curation_and_recall.md, architecture/opencode/recall_and_curation_improvements.md, architecture/opencode/review_agent_prompt_refinement.md]
---
title: Byterover Recall Window Update
summary: Recall now uses a separate recent window capped at 3 user turns or 4096 characters, while curation still uses only the current completed turn.

## Reason
Document the change to recall context window behavior and verification

## Raw Concept
**Task:**
Update the OpenCode plugin recall context builder

**Changes:**
- Added a separate recent context window for recall
- Bound the window to 3 recent user turns
- Bound the window to 4096 formatted characters
- Kept curation limited to the current completed turn
- Kept serialization to main text only

**Files:**
- dot_config/opencode/plugins/byterover.ts

**Flow:**
session messages -> walk backward through recent user turns -> collect formatted text until 3 turns or 4096 chars -> use for recall; curation remains current-turn only

**Timestamp:** 2026-04-24

**Author:** assistant

## Narrative
### Structure
The OpenCode Byterover plugin now separates recall-context gathering from curation-context gathering so historical recall can see a bounded recent window without expanding persistence scope.

### Dependencies
The update depends on walking backward through session messages and formatting text parts only, while excluding tools, files, and reasoning from serialization.

### Highlights
The change preserves main-text-only serialization while allowing recall to see more context. Verification completed successfully with formatter, linter, and typecheck checks.

### Examples
Recall window behavior: include up to 3 recent user turns or stop when 4096 formatted characters are reached.

## Facts
- **recall_turn_limit**: Recall now includes up to 3 recent user turns. [project]
- **recall_char_limit**: Recall now uses a 4096-character budget. [project]
- **curation_scope**: Curation still uses only the current completed turn. [project]
- **serialization_scope**: Serialization remains main text only via text parts, excluding tools, files, and reasoning. [project]
- **verification_checks**: Verification passed with oxfmt, oxlint, and typecheck. [project]