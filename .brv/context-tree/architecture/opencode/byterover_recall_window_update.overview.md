## Key points
- The OpenCode Byterover plugin was updated to **separate recall-context gathering from curation-context gathering**.
- **Recall** now uses a **recent context window** capped at **3 recent user turns** or **4096 formatted characters**, whichever is reached first.
- **Curation** remains limited to **the current completed turn only**, preserving the existing persistence scope.
- Serialization still uses **main text only**, explicitly excluding **tools, files, and reasoning**.
- The recall flow walks backward through session messages, collecting formatted text parts until the window limits are met.
- Verification reportedly passed with **formatter, linter, and typecheck** checks.

## Structure / sections summary
- **Metadata**: Title, summary, tags, related items, keywords, timestamps.
- **Reason**: Brief rationale for documenting the change and its verification.
- **Raw Concept**: Core task description, explicit changes, affected file, and the message-flow outline.
- **Narrative**:
  - **Structure**: Explains the architectural separation between recall and curation context gathering.
  - **Dependencies**: Notes reliance on walking session messages backward and serializing only text parts.
  - **Highlights**: Emphasizes bounded recall expansion without broader persistence.
  - **Examples**: Shows the recall window limit behavior.
- **Facts**: Concise project facts covering turn limit, character budget, curation scope, serialization scope, and verification checks.

## Notable entities, patterns, or decisions
- **File changed**: `dot_config/opencode/plugins/byterover.ts`
- **Key design decision**: Introduce a **bounded recall window** without changing curation behavior.
- **Pattern**: Traverse session messages **backward** to collect recent user turns.
- **Serialization rule**: Only **text parts** are serialized; non-text content is excluded.
- **Verification tools**: `oxfmt`, `oxlint`, and `typecheck` were used successfully.
- **Behavioral limits**:
  - **3 user turns** max for recall
  - **4096 characters** max for recall context