## Key points
- The document recommends improving **recall startup behavior** in the opencode architecture by adding a **best-effort timeout** using `AbortController`, since recall runs on the startup path before response generation.
- It proposes renaming the **curation prompt label** from **“Recent conversation”** to **“Conversation”** because curation only uses the **completed turn**, not broader history.
- It suggests keeping **“Recent conversation”** for **recall**, since recall should include recent history.
- A useful optional enhancement is to **log recall window size** for verification/debugging, with a suggested format like `recall using N messages / X chars`.
- Additional lower-priority ideas include **deduping repeated curation on idle**, and handling **oversize first-message edge cases**.
- The recommendations emphasize avoiding overly aggressive skipping rules: do not automatically skip messages like **“Do it,” “yes,” or “same”** without context.

## Structure / sections summary
- **Metadata**: title, summary, tags, related documents, keywords, timestamps.
- **Reason**: states the goal—capture durable recommendations for improving recall startup behavior and curation labeling.
- **Raw Concept**: contains the task, proposed changes, data flow, timestamp, and a suggested debug log pattern.
- **Narrative**:
  - **Structure**: explains the scope—recall path and curation labeling, with focus on startup responsiveness and clearer terminology.
  - **Dependencies**: notes recall uses `experimental.chat.system.transform`, making startup latency the main concern; curation only uses completed turns.
  - **Highlights**: ranks the most valuable recommendations.
  - **Rules**: gives a heuristic for trivial message skipping.
  - **Examples**: gives example timeout and log formats.
- **Facts**: a structured list of concrete recommendations and edge-case notes.

## Notable entities, patterns, or decisions
- **Entities / technical terms**
  - `AbortController`
  - `experimental.chat.system.transform`
  - `recall_timeout`, `curation_prompt_label`, `recall_prompt_label`
- **Decision points**
  - Add a **5–10 second best-effort timeout** for recall.
  - Rename curation label to **Conversation**.
  - Keep recall label as **Recent conversation**.
  - Optionally log recall window size for debugging.
  - Treat some short/trivial messages as skippable only when clearly non-referential.
- **Observed patterns**
  - Suggested debug format: `recall using N messages / X chars`
  - Startup-path recall is treated as latency-sensitive.
  - Curation is framed as operating on the **completed turn only**.