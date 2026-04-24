## Key points
- The document describes how the Byterover plugin serializes Opencode turn messages for **ingestion** and **recall**.
- The current curation path was changed to **remove readiness gating** before persistence, while **keeping readiness checks only for recall**.
- The plugin preserves **first-run bootstrap behavior** when `.brv` does not yet exist.
- Curation now uses `brvBridge.persist` in **default detached mode**; queued detached results are explicitly treated as **non-failures**.
- The formatter currently serializes roles, text, file references, reasoning, and completed tool outputs, but this pseudo-XML / delimiter-based format is considered **brittle**.
- Main risks identified: **delimiter collisions**, **undefined JSON values**, and **oversized tool outputs** causing noisy or unreliable memory ingestion.
- Recommended direction: **structured JSON serialization** with **truncation/capping of tool output**, and omission of **reasoning** for durable memory storage.

## Structure / sections summary
- **Title / metadata**: Identifies the document as “Byterover Plugin Curation and Recall” with related docs and timestamps.
- **Reason**: States the purpose is to document serialization guidance for Byterover ingestion and recall.
- **Raw Concept**:
  - Summarizes code changes in `dot_config/opencode/plugins/byterover.ts`.
  - Describes the end-to-end flow for curation and recall.
  - Lists validation steps (formatter, linter, TypeScript compiler).
- **Narrative**:
  - **Structure**: Explains that messages are fetched per turn, formatted by role/part, then either persisted on idle/compaction or recalled during system transform.
  - **Dependencies**: Notes reliance on Opencode message parts, Byterover bridge APIs, and the session message API.
  - **Highlights**: Calls out brittleness in the current formatter and motivations for a better format.
  - **Rules**: Defines curation criteria, emphasizing lasting-value content and excluding trivial acknowledgments.
  - **Examples**: Shows transcript-based curation input and system-prompt injection via `<byterover-context>...</byterover-context>`.
- **Facts**: Encodes key assertions about current format, recommended format, reasoning handling, and tool-output limits.

## Notable entities, patterns, and decisions
- **File**: `dot_config/opencode/plugins/byterover.ts`
- **Bridge API**: `brvBridge.ready()` is retained only for **recall**, not curation.
- **Trigger flow**:
  - `session idle or compacting -> fetch messages -> format -> persist`
  - `chat system transform -> fetch messages -> format -> recall context -> inject into system prompt`
- **Pattern**: Recalled context is wrapped with:
  - `^<byterover-context>\n[\s\S]*\n</byterover-context>$` (multiline)
- **Curation policy**:
  - Keep: facts, decisions, technical details, preferences, notable outcomes.
  - Skip: greetings, acknowledgments, one-word replies, and other non-substantive content.
- **Design decision**: Prefer **structured JSON** over delimiter-based pseudo-XML for memory ingestion.
- **Content policy**: Exclude **reasoning** from durable memory; cap **tool output** to reduce noise and size.