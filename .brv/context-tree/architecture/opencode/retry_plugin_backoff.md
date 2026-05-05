---
title: Retry Plugin Backoff
summary: Retry plugin now uses exponential backoff with full jitter, per-session retry tracking, state reset on non-overloaded errors, and verified formatting/lint success.
tags: []
related: [architecture/opencode/recall_window_and_curation_pipeline.overview.md]
keywords: []
createdAt: '2026-05-05T16:13:50.397Z'
updatedAt: '2026-05-05T16:13:50.397Z'
---
## Reason
Document durable implementation decisions and verification for the retry plugin update

## Raw Concept
**Task:**
Document the retry plugin backoff and jitter update

**Changes:**
- Added exponential backoff with full jitter
- Tracked retry attempts by session
- Reset retry state on non-overloaded API errors
- Recorded verification results for formatting, linting, and typechecking

**Files:**
- dot_config/opencode/plugins/retry.ts

**Flow:**
session.error -> APIError overloaded -> log -> delay with jitter -> retry prompt -> handle response

**Timestamp:** 2026-05-05T16:13:33.547Z

## Narrative
### Structure
The plugin handles session.error events, inspects APIError overload messages, and resubmits the prior prompt after a randomized exponential delay.

### Dependencies
Depends on client.app.log for logging and client.session.promptAsync for retrying the request.

### Highlights
Full jitter avoids synchronized retry bursts. Verification showed format and lint success; typecheck was blocked by a missing tsc dependency.

### Rules
Use full jitter: random delay between 0 and the current capped exponential delay. Clear retry state when the error is not overloaded.

### Examples
On an overloaded APIError, the plugin logs the retry attempt and waits before sending the retry prompt again.

## Facts
- **retry_strategy**: The retry plugin was updated to add exponential backoff with jitter for overloaded API errors. [project]
- **retry_backoff_bounds**: Backoff starts at 1 second and is capped at 30 seconds. [project]
- **retry_tracking**: Retry attempts are tracked per sessionID. [project]
- **retry_state_reset**: Retry state is cleared on non-overloaded API errors. [project]
- **verification_status**: Format check and lint passed, but typecheck could not run because tsc is not installed in dot_config/opencode dependencies. [project]
