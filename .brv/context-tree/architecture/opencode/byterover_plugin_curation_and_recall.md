---
consolidated_at: '2026-05-05T15:55:10.727Z'
consolidated_from: [{date: '2026-05-05T15:55:10.727Z', path: architecture/opencode/byterover_plugin_recall_and_curation.md, reason: 'These files overlap heavily on the same plugin serialization/recall/curation workflow for the same source file. The recall-and-curation note and the curation-and-recall note duplicate most of the same facts, rules, and validation details, while the overview and abstract are derivative summaries.'}, {date: '2026-05-05T15:55:10.727Z', path: architecture/opencode/byterover_plugin_curation_and_recall.overview.md, reason: 'These files overlap heavily on the same plugin serialization/recall/curation workflow for the same source file. The recall-and-curation note and the curation-and-recall note duplicate most of the same facts, rules, and validation details, while the overview and abstract are derivative summaries.'}, {date: '2026-05-05T15:55:10.727Z', path: architecture/opencode/byterover_plugin_curation_and_recall.abstract.md, reason: 'These files overlap heavily on the same plugin serialization/recall/curation workflow for the same source file. The recall-and-curation note and the curation-and-recall note duplicate most of the same facts, rules, and validation details, while the overview and abstract are derivative summaries.'}]
related: [architecture/opencode/byterover_context_engine_ideas.md, architecture/opencode/byterover_recall_window_update.md, architecture/opencode/recall_and_curation_improvements.md, architecture/opencode/review_agent_prompt_refinement.md]
---
title: Byterover Plugin Curation and Recall
summary: Byterover plugin should prefer structured JSON serialization, omit reasoning, cap tool output, include the latest user message, skip empty inputs, guard bridge readiness, use blocking persist status checks, and surface background curation failures.

## Reason
Document guidance on serializing Opencode messages for Byterover ingestion and recall

## Raw Concept
**Task:**
Assess and document the serialization strategy used by `dot_config/opencode/plugins/byterover.ts` for Byterover turn ingestion and recall.

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
- Include latest user message when serializing a turn for recall and curation
- Use brv-bridge persist with detach:false when checking completion status
- Skip empty text-only serialization and empty recall results
- Wrap idle curation in an observed background promise
- Pass a brv-bridge logger into client.app.log so bridge best-effort failures remain visible
- Include the latest user message in serialized turns for recall/curation
- Skip empty recall and serialization inputs
- Check bridge readiness before recall and curation
- Use blocking persist mode for curation completion checks
- Observe background curation failures and await curation during compacting
- Add bridge logging and fix recall prompt formatting

**Files:**
- dot_config/opencode/plugins/byterover.ts

**Flow:**
session idle or compacting -> fetch messages in turn -> format messages -> persist to Byterover; chat system transform -> fetch messages in turn -> format messages -> recall context -> inject into system prompt; user message -> serialize turn -> recall/curate -> bridge readiness check -> persist status check -> background curation observation -> validation

**Timestamp:** 2026-04-24

**Author:** ByteRover

**Patterns:**
- `^<byterover-context>\n[\s\S]*\n</byterover-context>$` (flags: m) - Wraps recalled context before injection into system prompt
- `^\[user\]:\n` - Serialized user message prefix
- `^\[assistant\]:\n` - Serialized assistant message prefix

## Narrative
### Structure
The plugin fetches all messages in the current turn, formats them with role labels and part-specific tags, then either persists the result on idle/compaction or recalls context during system transform. This entry captures the durable review outcome for the Byterover opencode plugin, focusing on recall, curation, and reliability behavior.

### Dependencies
Serialization depends on Opencode message parts, Byterover bridge persistence and recall calls, the session message API, brvBridge.ready(), persist(..., { detach: false }), and client.app.log.

### Highlights
The current formatter preserves text, reasoning, file references, and completed tool results, but delimiter collisions, undefined JSON values, and oversized tool outputs make the format brittle for ingestion. The plugin now behaves more reliably by avoiding empty injections, surfacing bridge failures, and aligning persistence checks with the bridge API. The recommended direction is structured JSON serialization with truncated tool output and omission of reasoning for durable memory storage.

### Rules
Curate only information with lasting value: facts, decisions, technical details, preferences, or notable outcomes. Skip trivial messages such as greetings, acknowledgments ("ok", "thanks", "sure", "got it"), one-word replies, anything with no substantive content. If brvBridge.ready() returns false, skip curation or recall and log an error. If messagesInTurn is empty, return immediately. If formattedMessages is empty, return immediately. If brvResult.status is not "completed", log the failure. If recalled content trims to an empty string, do not inject it into system.

### Examples
Example curation input is a conversation transcript prefixed with instruction text and separated by --- between messages. Example recall output is appended to system as <byterover-context>...</byterover-context>. Validation commands included npm exec -- oxfmt --write plugins/byterover.ts, npm exec -- oxlint plugins/byterover.ts, and tsc with strict NodeNext settings.

## Facts
- `byterover_message_serialization`: The Byterover plugin formats turn messages for ingestion by iterating over message parts and serializing role, text, file, and completed tool parts. [project]
- `byterover_current_format`: The current formatter uses bracketed role headers, reasoning tags, file tags, and tool tags joined with separator lines. [project]
- `byterover_recommended_format`: The recommended format is structured JSON serialization instead of delimiter-based pseudo-XML. [project]
- `byterover_reasoning_handling`: Reasoning parts should be omitted from durable memory ingestion because they are internal process and add noise. [project]
- `byterover_tool_output_cap`: Tool outputs should be capped or truncated before persistence to avoid oversized or noisy context. [project]
- `plugin_latest_user_message`: The plugin update includes the latest user message when serializing a turn for recall and curation. [project]
- `plugin_empty_inputs`: Empty text parts, empty serialized turns, and empty recall results are skipped. [project]
- `bridge_readiness_check`: `brvBridge.ready()` is checked before both recall and curation. [project]
- `persist_detach_mode`: `persist(..., { detach: false })` is used when checking curation completion status. [project]
- `idle_curation_background_handling`: Idle curation is wrapped in an observed background promise to avoid unhandled async failures. [project]
- `compacting_curation_behavior`: Curation is awaited during compacting. [project]
- `bridge_logging`: BrvBridge logger is wired into client.app.log so bridge best-effort failures are visible. [project]
- `recall_prompt_cleanup`: Recall prompt spacing/newlines and the mesages typo were fixed. [project]
- `validation_commands`: Validation used oxfmt, oxlint, and tsc noEmit on plugins/byterover.ts. [project]
- `dependency_vulnerabilities`: npm install reported 3 moderate dependency vulnerabilities without changing the lockfile. [project]

## Relations
- Related to `architecture/opencode/byterover_context_engine_ideas.md` for broader context-engine cleanup and recall-safeguard ideas.
- Related to `architecture/opencode/byterover_recall_window_update.md` for the bounded recall-window behavior that affects this plugin's recall flow.
- Related to `architecture/opencode/recall_and_curation_improvements.md` for proposed follow-up improvements such as recall timeout and label renaming.