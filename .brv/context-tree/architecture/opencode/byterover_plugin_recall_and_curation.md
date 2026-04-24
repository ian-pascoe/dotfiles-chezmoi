---
title: ByteRover Plugin Recall and Curation
summary: ByteRover plugin now includes latest user messages in recall/curation, skips empty injections, guards bridge readiness, uses blocking persist status checks, and observes background curation failures.
tags: []
related: [architecture/opencode/byterover_plugin_recall_and_curation.md]
keywords: []
createdAt: '2026-04-24T09:45:37.096Z'
updatedAt: '2026-04-24T09:46:57.066Z'
---
## Reason
Document the durable findings from the plugin review and update work

## Raw Concept
**Task:**
Document the ByteRover plugin recall and curation improvements from the review and validation run

**Changes:**
- Include latest user message when serializing a turn for recall and curation
- Use brv-bridge persist with detach:false when checking completion status
- Skip empty text-only serialization and empty recall results
- Wrap idle curation in an observed background promise
- Pass a brv-bridge logger into client.app.log so bridge best-effort failures remain visible
- Includes the latest user message in serialized turns for recall/curation
- Skips empty recall and serialization inputs
- Checks bridge readiness before recall and curation
- Uses blocking persist mode for curation completion checks
- Observes background curation failures and awaits curation during compacting
- Adds bridge logging and fixes recall prompt formatting

**Files:**
- dot_config/opencode/plugins/byterover.ts

**Flow:**
user message -> serialize turn -> recall/curate -> bridge readiness check -> persist status check -> background curation observation -> validation

**Timestamp:** 2026-04-24

**Author:** assistant

**Patterns:**
- `^\[user\]:\n` - Serialized user message prefix
- `^\[assistant\]:\n` - Serialized assistant message prefix

## Narrative
### Structure
This entry captures the durable review outcome for the ByteRover opencode plugin, focusing on recall, curation, and reliability behavior.

### Dependencies
The work depends on the ByteRover bridge API, client.app.log for observability, and TypeScript validation tools.

### Highlights
The plugin now behaves more reliably by avoiding empty injections, surfacing bridge failures, and aligning persistence checks with the bridge API.

### Rules
If brvBridge.ready() returns false, skip curation or recall and log an error. If messagesInTurn is empty, return immediately. If formattedMessages is empty, return immediately. If brvResult.status is not "completed", log the failure. If recalled content trims to an empty string, do not inject it into system.

### Examples
Validation commands included npm exec -- oxfmt --write plugins/byterover.ts, npm exec -- oxlint plugins/byterover.ts, and tsc with strict NodeNext settings.

## Facts
- **plugin_latest_user_message**: The plugin update includes the latest user message when serializing a turn for recall and curation. [project]
- **plugin_empty_inputs**: Empty text parts, empty serialized turns, and empty recall results are skipped. [project]
- **bridge_readiness_check**: brvBridge.ready() is checked before both recall and curation. [project]
- **persist_detach_mode**: persist(..., { detach: false }) is used when checking curation completion status. [project]
- **idle_curation_background_handling**: Idle curation is wrapped in an observed background promise to avoid unhandled async failures. [project]
- **compacting_curation_behavior**: Curation is awaited during compacting. [project]
- **bridge_logging**: BrvBridge logger is wired into client.app.log so bridge best-effort failures are visible. [project]
- **recall_prompt_cleanup**: Recall prompt spacing/newlines and the mesages typo were fixed. [project]
- **validation_commands**: Validation used oxfmt, oxlint, and tsc noEmit on plugins/byterover.ts. [project]
- **dependency_vulnerabilities**: npm install reported 3 moderate dependency vulnerabilities without changing the lockfile. [project]
