## Key points
- The document captures **transferable context-engine ideas** from a ByteRover/OpenClaw discussion, focused on **lasting-value curation** and **noise reduction**.
- Persistence should **store only meaningful content**: facts, decisions, technical details, preferences, and notable outcomes.
- The system should **skip trivial or internal messages** such as greetings, acknowledgments, one-word replies, session-start noise, and tool results.
- Before storage or recall, the engine should **clean message text** by stripping metadata, user transport noise, and assistant wrapper/runtime tags.
- Recall should prefer the **latest cleaned user query** as the search input, with fallback to scanning history if needed.
- Recall is designed to be **best-effort**, protected by a **timeout/abort guard** so it does not block agent startup or responsiveness.
- The overall flow is: **messages → filter noise → strip metadata/tags → serialize clean text → persist curated knowledge → recall using latest cleaned query**.

## Structure / sections summary
- **Title / metadata**: Identifies the note as “ByteRover Context Engine Ideas” with a short summary and linkage to a related architecture document.
- **Reason**: States the goal is to capture transferable implementation ideas from the OpenClaw context-engine discussion.
- **Raw Concept**: Describes the main changes, flow, timestamp, and source context for the ideas.
- **Narrative**:
  - **Structure**: Explains separation between **afterTurn persistence** and **assemble-time recall**.
  - **Dependencies**: Lists helper functions and timeout/abort support needed by the engine.
  - **Highlights**: Emphasizes noise control, selective persistence, and best-effort recall.
  - **Examples**: Shows a persisted transcript format and recall input fallback behavior.
- **Facts**: Enumerates the operational rules as explicit conventions/project decisions.

## Notable entities, patterns, or decisions
- **Entities**
  - **ByteRover / OpenClaw** context engine discussion
  - **afterTurn persistence**
  - **assemble-time recall**
  - **abort controller timeout**
  - **clean message extraction helpers** (metadata stripping, sender/timestamp extraction, assistant-tag stripping)
- **Patterns**
  - **Selective persistence**: only durable, human-useful information is stored.
  - **Transcript normalization**: messages are converted into clean, readable lines like `[user]: cleaned text`.
  - **Fallback recall strategy**: use current prompt first, then history scanning if necessary.
  - **Defensive recall**: short-query skipping and timeout protection reduce unnecessary work and latency.
- **Decisions**
  - **Tool outputs are excluded** from serialization as implementation detail noise.
  - **Metadata and assistant tags are stripped** before curation and recall.
  - **Recall is non-blocking/best-effort**, prioritizing agent responsiveness over perfect retrieval.