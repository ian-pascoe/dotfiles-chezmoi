---
title: Byterover Plugin Curation and Recall
summary: Byterover plugin should prefer structured JSON serialization, omit reasoning, and cap tool output to avoid delimiter collisions and noisy memory ingestion.
tags: []
related: [architecture/opencode/byterover_plugin_recall_and_curation.md, architecture/opencode/byterover_plugin_curation_and_recall.md]
keywords: []
createdAt: '2026-04-24T09:48:42.687Z'
updatedAt: '2026-04-24T10:31:10.547Z'
---
## Reason
Document guidance on serializing Opencode messages for Byterover ingestion and recall

## Raw Concept
**Task:**
Assess and document the serialization strategy used by dot_config/opencode/plugins/byterover.ts for Byterover turn ingestion.

**Changes:**
- Removed readiness gating before persist-based curation paths
- Kept readiness check only for recall
- Preserved first-run bootstrap behavior when .brv does not yet exist
- Removed brvBridge.ready() from the curation/retain path
- Kept brvBridge.ready() only before recall
- Validated with formatter, linter, and TypeScript compiler checks
- Adjusted curation retain behavior so brvBridge.persist uses default detached mode
- Clarified that queued detached persist results are not failures
- Preserved idle and compaction triggers for curation
- Preserved system transform recall injection flow
- Evaluated the message formatter that serializes user and assistant turns for Byterover
- Identified risks in delimiter-based pseudo-XML formatting
- Recommended structured JSON serialization with truncation for durable memory ingestion

**Files:**
- dot_config/opencode/plugins/byterover.ts

**Flow:**
session idle or compacting -> fetch messages in turn -> format messages -> persist to Byterover; chat system transform -> fetch messages in turn -> format messages -> recall context -> inject into system prompt

**Timestamp:** 2026-04-24

**Author:** ByteRover

**Patterns:**
- `^<byterover-context>\n[\s\S]*\n</byterover-context>$` (flags: m) - Wraps recalled context before injection into system prompt

## Narrative
### Structure
The plugin fetches all messages in the current turn, formats them with role labels and part-specific tags, then either persists the result on idle/compaction or recalls context during system transform.

### Dependencies
Serialization depends on Opencode message parts, Byterover bridge persistence and recall calls, and the session message API.

### Highlights
The current formatter preserves text, reasoning, file references, and completed tool results, but delimiter collisions, undefined JSON values, and oversized tool outputs make the format brittle for ingestion.

### Rules
Curate only information with lasting value: facts, decisions, technical details, preferences, or notable outcomes. Skip trivial messages such as greetings, acknowledgments ("ok", "thanks", "sure", "got it"), one-word replies, anything with no substantive content.

### Examples
Example curation input is a conversation transcript prefixed with instruction text and separated by --- between messages. Example recall output is appended to system as <byterover-context>... </byterover-context>.

## Facts
- **byterover_message_serialization**: The Byterover plugin formats turn messages for ingestion by iterating over message parts and serializing role, text, file, and completed tool parts. [project]
- **byterover_current_format**: The current formatter uses bracketed role headers, reasoning tags, file tags, and tool tags joined with separator lines. [project]
- **byterover_recommended_format**: The recommended format is structured JSON serialization instead of delimiter-based pseudo-XML. [project]
- **byterover_reasoning_handling**: Reasoning parts should be omitted from durable memory ingestion because they are internal process and add noise. [project]
- **byterover_tool_output_cap**: Tool outputs should be capped or truncated before persistence to avoid oversized or noisy context. [project]
