---
consolidated_at: '2026-05-05T15:55:10.724Z'
consolidated_from: [{date: '2026-05-05T15:55:10.724Z', path: architecture/opencode/byterover_context_engine_ideas.overview.md, reason: 'These are the same topic in three representations of one note: the markdown source, its overview, and its abstract. The overview and abstract are derivative summaries of the source content, so they are redundant rather than complementary.'}, {date: '2026-05-05T15:55:10.724Z', path: architecture/opencode/byterover_context_engine_ideas.abstract.md, reason: 'These are the same topic in three representations of one note: the markdown source, its overview, and its abstract. The overview and abstract are derivative summaries of the source content, so they are redundant rather than complementary.'}]
related: [architecture/opencode/byterover_plugin_curation_and_recall.md, architecture/opencode/byterover_recall_window_update.md, architecture/opencode/recall_and_curation_improvements.md, architecture/opencode/review_agent_prompt_refinement.md]
---
title: ByteRover Context Engine Ideas
summary: OpenClaw context engine ideas: curate only lasting-value content, skip tool/heartbeat noise, strip metadata and assistant tags, use latest clean user query for recall, and keep recall best-effort with timeout protection.

## Reason
Capture transferable implementation ideas from the OpenClaw context engine discussion

## Raw Concept
**Task:**
Document transferable ideas from the ByteRover/OpenClaw context engine approach

**Changes:**
- Identified curation filters for lasting-value content
- Captured message-cleaning rules for metadata, assistant tags, and tool results
- Captured recall safeguards such as short-query skipping and timeout protection

**Flow:**
turn messages -> filter noise -> strip metadata/tags -> serialize clean text -> persist curated knowledge -> recall with latest cleaned user query

**Timestamp:** 2026-04-24

**Author:** ByteRover/OpenClaw discussion

## Narrative
### Structure
The engine separates afterTurn persistence from assemble-time recall. Persistence serializes only the new turn messages, while recall uses the current user query when possible and injects curated knowledge as a system prompt addition.

### Dependencies
Depends on clean message extraction helpers such as user-metadata stripping, sender/timestamp extraction, and assistant-tag stripping. The recall path also depends on an abort controller timeout so the agent remains responsive.

### Highlights
Strongest reusable ideas are noise control, selective persistence, and best-effort recall. Tool outputs and trivial chatter are excluded, while meaningful user and assistant text is preserved in a readable transcript format.

### Examples
Example persisted line format: [user]: cleaned text. Example recall behavior: use params.prompt first, then fall back to scanning messages for the latest user query.

## Facts
- **curation_scope**: Curation should keep only lasting-value content such as facts, decisions, technical details, preferences, and notable outcomes. [convention]
- **skip_content**: Trivial messages like greetings, acknowledgments, one-word replies, and automated session-start messages should be skipped. [convention]
- **tool_result_handling**: Tool result messages should be skipped during serialization because they are internal implementation details. [convention]
- **user_metadata_handling**: User metadata should be stripped before curating or recalling so the engine sees the actual request rather than transport noise. [convention]
- **assistant_tag_handling**: Assistant wrapper tags such as model/runtime tags should be removed before persistence. [convention]
- **recall_query_source**: Recall should query using the latest cleaned user prompt when available, falling back to history scan only when needed. [project]
- **recall_short_query_filter**: Trivially short recall queries should be skipped to avoid unnecessary recall calls. [convention]
- **recall_timeout_guard**: Recall should use a best-effort timeout guard so it does not block the agent startup path for too long. [convention]