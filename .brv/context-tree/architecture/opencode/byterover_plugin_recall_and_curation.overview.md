## Key points
- The ByteRover plugin update captures the latest user message when serializing turns for recall and curation.
- Empty inputs are now filtered out: empty text-only serialization, empty recall results, and empty message sets are skipped early.
- The plugin checks `brvBridge.ready()` before attempting recall or curation, and logs an error if the bridge is unavailable.
- Curation completion status uses `persist(..., { detach: false })`, making the check blocking rather than detached.
- Idle curation is wrapped in an observed background promise so async failures are surfaced instead of disappearing silently.
- Bridge logging is wired into `client.app.log` to improve visibility into best-effort bridge failures.
- Recall prompt formatting was cleaned up, including spacing/newline fixes and a typo correction.

## Structure / sections summary
- **Reason**: States the goal of documenting durable findings from the plugin review and update work.
- **Raw Concept**: Lists the concrete implementation changes, flow, timestamp, author, and key serialization patterns.
- **Narrative**: Summarizes the intent, dependencies, reliability improvements, and operational rules for recall/curation behavior.
- **Examples**: Mentions validation commands used to verify the plugin changes.
- **Facts**: Enumerates specific project facts such as user-message inclusion, readiness checks, blocking persist mode, background failure handling, and validation results.

## Notable entities, patterns, or decisions
- **File touched**: `dot_config/opencode/plugins/byterover.ts`
- **Bridge/API dependency**: `brvBridge.ready()`, `persist(..., { detach: false })`, and `client.app.log`
- **Serialization prefixes**:
  - `^[user]:\n`
  - `^[assistant]:\n`
- **Operational decisions**:
  - Skip recall/curation when bridge is not ready.
  - Return immediately on empty serialized content or empty recall output.
  - Treat non-`"completed"` persist status as a failure and log it.
  - Await curation during compacting and observe idle background curation failures.
- **Validation tooling**:
  - `npm exec -- oxfmt --write plugins/byterover.ts`
  - `npm exec -- oxlint plugins/byterover.ts`
  - `tsc` with strict NodeNext settings
- **Additional note**: `npm install` reported 3 moderate dependency vulnerabilities, but the lockfile was unchanged.