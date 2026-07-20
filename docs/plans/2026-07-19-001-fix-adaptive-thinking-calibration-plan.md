---
title: Adaptive Thinking Result Calibration - Plan
type: fix
date: 2026-07-19
topic: omp-adaptive-thinking-calibration
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: session-history-audit
execution: code
---
<!-- markdownlint-disable MD013 MD025 MD036 -->

# Adaptive Thinking Result Calibration - Plan

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat e6afe02..HEAD -- private_dot_omp/private_agent/extensions/adaptive-thinking.ts private_dot_omp/private_agent/extensions/adaptive-thinking.test.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `e6afe02`, 2026-07-19

## Why this matters

The current extension is broadly effective: among 320 calls in sessions that started on or after 2026-07-16, 308 of 310 successful calls changed the effective level, all 320 calls carried a nonblank reason, and sampled transitions tracked real phase or evidence changes. The remaining calibration gap is concentrated around verification: 59 down-then-up pairs occurred across 22 sessions, 46 began with verification-oriented de-escalation, and 38 reversed within ten minutes. The policy currently describes low effort partly as “rerunning a known test” and asks for adjustment before a substantive tool call, even though the selected effort affects the *next model inference*—especially interpretation of the tool result—not the external command itself.

This plan keeps the model-led checkpoint architecture and reason breadcrumbs. It narrows the guidance so agents retain adequate effort through uncertain verification, immediately reassess when failed proof invalidates a de-escalation, and recognize explicit concurrency/state-machine assignments before implementation.

## Current state

- `private_dot_omp/private_agent/extensions/adaptive-thinking.ts` — deployable chezmoi source for the extension.
  - `:24` defines low as `known-path mechanical edits, targeted lookup, or rerunning a known test`.
  - `:43-54` tells the model to match the current phase, change before the next substantive reasoning or tool call, reassess after failures, and de-escalate when work becomes known-path.
  - `:58-60` correctly preserves persistence, stability, and the lower-level tie-breaker.
- `private_dot_omp/private_agent/extensions/adaptive-thinking.test.ts` — focused Vitest harness and model-facing prompt-contract tests.
  - `:211-244` asserts the injected policy text.
  - `:236` specifically locks in the action-centric `low ... known test` wording and must change with the policy.

Current source shape (`adaptive-thinking.ts:43-60`):

```ts
"- Objective: Match effort to the current phase, not the entire task. A long coding task can legitimately move through several levels.",
"- Initial checkpoint: Before the first substantive action on a new user task, select the lowest adequate target. If the target differs from Current, call set_thinking_level before continuing.",
// ...
"  - After unexpected evidence such as a test failure, tool error, conflicting requirements, an ambiguous API, or a failed fix.",
// ...
"- De-escalate once uncertainty is resolved and the remaining work is known-path, mechanical, or routine verification.",
```

Observed evidence to preserve or correct:

- Positive behavior: `~/.omp/agent/sessions/-.herdr-worktrees-caplets-dependabot-npm_and_yarn-production-dependencies-a0b7b495df/2026-07-19T12-38-27-734Z_019f7a62-9096-7000-99cc-cbf991730112.jsonl:42-58` lowered high→medium for bounded repair, then returned to high when verification exposed an Astro/TypeScript compatibility decision.
- Verification oscillation: the same transcript at `:91-105` lowered for a routine full gate and returned to high when the gate exposed parallel-suite and dependency-contract failures. This pattern repeated later in that session.
- Missed reassessment: `~/.omp/agent/sessions/-.herdr-worktrees-caplets-worktree-brave-river-c600/2026-07-14T11-56-12-514Z_019f607c-1562-7000-bfa0-73ddfe65e5ac/U10ConvergentActivation/U10ConvergentActivation.HttpSqlAuthority.jsonl:487-501` lowered high→medium for final verification, received three security/authorization test failures, and began diagnosis and edits without reassessing.
- Late concurrency recognition: `~/.omp/agent/sessions/-.herdr-worktrees-caplets-worktree-brave-river-c600/2026-07-14T11-56-12-514Z_019f607c-1562-7000-bfa0-73ddfe65e5ac/SetupLeaseAbort.jsonl:4-6,112-123` began an assignment involving lease renewal, abort races, process termination, and guarded finalization at medium; it escalated only after timeout/failures. It later de-escalated and passed 42/42 focused tests at `:249-255`.
- Premature low verification: `~/.omp/agent/sessions/-.herdr-worktrees-caplets-worktree-brave-river-c600/2026-07-14T11-56-12-514Z_019f607c-1562-7000-bfa0-73ddfe65e5ac/CliExportFix.jsonl:117-125` lowered while TypeScript/API risk remained, discovered that the intended language-server check was unavailable, then yielded without a replacement typecheck.

Repository conventions:

- Edit chezmoi source files, never `~/.omp/agent/extensions/adaptive-thinking.ts` directly.
- Apply only the relevant deployed destination after focused source verification.
- Keep prompt guidance concise and replace existing wording instead of adding a second competing policy.
- Tests use Node `assert` with Vitest and validate the observable model-facing contract; follow `adaptive-thinking.test.ts:193-244`.
- Do not churn lockfiles.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `cd private_dot_omp/private_agent && npx vitest run extensions/adaptive-thinking.test.ts` | exit 0; all focused tests pass |
| Typecheck | `cd private_dot_omp/private_agent && npx tsc --noEmit` | exit 0; no diagnostics |
| Deploy | `chezmoi apply /home/ianpascoe/.omp/agent/extensions/adaptive-thinking.ts` | exit 0; no error output |
| Live smoke | `omp -p --mode=json --no-session --no-skills --no-rules --thinking=medium --auto-approve "Before any other substantive action, calibrate effort for designing cancellation-safe lease renewal with abort races and guarded finalization. Use set_thinking_level with a concise reason, then reply DONE only."` | exit 0; JSON contains one successful adaptive call to `high` or `xhigh`, a nonblank reason, and final `DONE` |

## Scope

**In scope** (the only source files to modify):

- `private_dot_omp/private_agent/extensions/adaptive-thinking.ts`
- `private_dot_omp/private_agent/extensions/adaptive-thinking.test.ts`

**Out of scope**:

- `~/.omp/agent/extensions/adaptive-thinking.ts` — generated/deployed destination; deploy via chezmoi only.
- OMP host sources under `node_modules/` — do not patch vendored dependencies.
- The child-session cold-revival lifecycle bug; it is host-owned and requires an upstream OMP fix.
- Tool schema, level enum, reason optionality, supported-level validation, persistence behavior, and setter semantics.
- A fixed transition cooldown, call cap, mandatory reason, promotion of `minimal`/`off`, or automatic level classification.
- New telemetry/scripts; use the post-deployment measurement protocol below instead.
- Any lockfile, package manifest, or unrelated global instruction change.

## Git workflow

- Branch: `advisor/001-calibrate-thinking-results`
- Keep this as one logical change. Repository history commonly uses `chore: update`; prefer the more descriptive `fix: calibrate adaptive thinking around verification` if committing.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Lock the revised prompt contract in focused tests

Update the existing model-facing assertions in `adaptive-thinking.test.ts` before changing source:

1. Replace the assertion that low means rerunning a known test.
2. Assert that target selection is based on the reasoning needed for the next model inference, including interpretation of the next tool result—not the mechanical complexity of invoking a tool.
3. Assert that the model must not de-escalate solely to run a verifier when a plausible failure would reopen diagnosis at the current level.
4. Assert that failed verification after a de-escalation invalidates the prior confidence and requires reassessment before the first diagnostic action.
5. Assert that low-effort verification requires a known, available check and no unresolved contract/type/security uncertainty.
6. Assert that explicit lease renewal, cancellation/abort races, guarded finalization, or process-lifecycle coordination are concurrency signals at the initial checkpoint.
7. Preserve all existing assertions for supported levels, no-op avoidance, long-running reassessment, reasons, persistence, stability, and the lower-level tie-breaker.

These tests intentionally assert prompt text because the prompt is the extension’s observable behavior. Use semantic regexes, not an exact full-string snapshot.

**Verify**: `cd private_dot_omp/private_agent && npx vitest run extensions/adaptive-thinking.test.ts` → the revised contract assertions fail against the old source for the new semantics; all unrelated tests remain passing.

### Step 2: Reframe selection around the next inference

Update `LEVEL_GUIDANCE` and `steeringGuidance` in `adaptive-thinking.ts`. Keep one concise policy; do not append redundant paragraphs.

Required final semantics:

- `low` covers predictable result interpretation and known-path mechanical work with negligible diagnostic uncertainty. Do not cite “rerunning a known test” as sufficient by itself.
- The objective states that the selected level governs the *next model call*. Choose it for the reasoning needed to interpret the expected tool result or make the next decision; do not choose it merely from command/edit mechanics.
- Initial calibration explicitly treats lease/cancellation/abort races, guarded finalization, process termination, and similar state-machine coordination as concurrency risk before implementation.
- De-escalation into low verification is allowed only when the remaining check is known and available and unresolved contract/type/security uncertainty is absent.
- Do not lower solely to invoke a verifier if a plausible failure would require returning immediately to the current diagnostic level. Retaining the current level across a short repair/verify loop is stability, not a failure to adapt.
- If verification fails after a de-escalation, that evidence invalidates the prior confidence; reassess before the first diagnostic read/edit/command.
- Keep the existing rule to escalate on unexpected evidence, but avoid duplicating it in multiple bullets.

Preserve dynamic supported-level rendering and all tool execution behavior.

**Verify**: `cd private_dot_omp/private_agent && npx vitest run extensions/adaptive-thinking.test.ts` → all focused tests pass.

### Step 3: Verify types, deploy narrowly, and smoke a new session

Run the focused TypeScript check, apply only the adaptive extension destination, then launch a new no-session OMP process so the modified extension is loaded from startup.

**Verify**:

1. `cd private_dot_omp/private_agent && npx tsc --noEmit` → exit 0, no diagnostics.
2. `chezmoi apply /home/ianpascoe/.omp/agent/extensions/adaptive-thinking.ts` → exit 0.
3. Run the live smoke command from the command table → one successful high/xhigh adaptive call with a concise reason, then `DONE`.

If the live model chooses `medium`, STOP: the concurrency-at-initial-checkpoint guidance is not strong enough. Do not weaken the test expectation to accept medium.

### Step 4: Record the post-deployment evaluation protocol

Do not add telemetry code. Preserve this baseline for the next history review:

- Cohort: sessions starting on/after 2026-07-16 in the frozen pre-plan corpus: 309 sessions, 320 calls.
- Adoption: 134/309 sessions; top-level 12/13, child 122/296.
- Successful changes/no-ops: 308 changed, 2 no-op; ten outer errors were independent Guardian or host lifecycle failures.
- Reasons: 320/320 nonblank.
- Calls per 1,000 assistant model-output events: 11.37.
- Short oscillation: 59 down→up adjacent call pairs across 22 sessions; 46 verification-oriented; 38 reversed within ten minutes.

After at least 20 new eligible sessions, rerun the same event definitions against only the new cohort:

- Adaptive call: direct `set_thinking_level` or `write` to `xd://set_thinking_level` with its matching tool result.
- Assistant model-output event: JSONL `type=message` and nested `message.role=assistant`.
- Short oscillation: a successful downshift followed by a successful upshift in the same session within ten minutes; separately classify whether the down reason named test/check/verification/gate/rerun/build/smoke.
- Exclude bare `thinking_level_change` events because hotkeys and configuration can emit them without the plugin.
- Segment top-level and child sessions.

The desired signal is fewer verification-oriented short oscillations without reduced reason coverage, increased no-ops, missed failure reassessment, or loss of legitimate phase adaptation. Do not impose a hard calls-per-session cap; long resumable sessions legitimately span many tasks and phases.

**Verify**: no code command is required now; a reviewer confirms this baseline and event definition remain in the plan’s maintenance record.

## Test plan

Modify `private_dot_omp/private_agent/extensions/adaptive-thinking.test.ts`, using the existing `appends concise decision guidance without replacing existing prompt blocks` test as the structural pattern.

Coverage required:

- Next-inference/result-interpretation objective is present.
- Tool mechanics alone do not justify a lower level.
- Verification failure invalidates a prior de-escalation before diagnosis.
- Low verification requires an available known check and resolved residual risk.
- Explicit concurrency/state-machine signals are recognized at initial calibration.
- Existing positive contracts remain: phase/evidence checkpoints, reasons, supported levels, persistence, stability, and tie-breaker.

Verification: `cd private_dot_omp/private_agent && npx vitest run extensions/adaptive-thinking.test.ts` → all tests pass, including the revised guidance assertions.

## Done criteria

- [ ] Focused Vitest command exits 0 with all adaptive-thinking tests passing.
- [ ] `npx tsc --noEmit` exits 0 from `private_dot_omp/private_agent`.
- [ ] The low-level scale no longer treats merely rerunning a known test as sufficient calibration.
- [ ] Injected guidance explicitly targets next-model-call result interpretation.
- [ ] Injected guidance covers verifier availability, failed-verification invalidation, and initial concurrency signals.
- [ ] No tool execution/schema/persistence behavior changed.
- [ ] Chezmoi applies only `/home/ianpascoe/.omp/agent/extensions/adaptive-thinking.ts` successfully.
- [ ] A fresh OMP live smoke selects high or xhigh for the explicit lease/abort-race task and records a nonblank reason.
- [ ] No files outside the in-scope source files and this plan are modified.

## STOP conditions

Stop and report back; do not improvise if:

- Either in-scope source file drifted from the excerpts or tests described above.
- Achieving the new semantics appears to require tool schema/execution changes rather than guidance changes.
- The active model does not advertise `high` or `xhigh` during the live smoke.
- The live smoke repeatedly chooses `medium` for the explicit concurrency task after the focused tests pass.
- A verification command fails twice after one reasonable correction.
- The change requires editing the deployed home file directly, a lockfile, package manifest, global instructions, or OMP host code.

## Maintenance notes

- Evaluate levels according to the reasoning performed by the next model call, not the external work performed by a tool.
- Reviewers should reject wording that suppresses all verification de-escalation; predictable, available checks with low diagnostic risk remain valid low-effort work.
- Reviewers should also reject a fixed cooldown or per-session call cap. The 28-call top-level outlier and seven-call child outlier both represented long, legitimate phase/scope changes.
- Same-level setter short-circuiting is deliberately deferred: recent no-ops were only 2/320 and a setter optimization would not recover the already-spent model round trip.
- Keep `reason` optional. Current model compliance was 320/320 nonblank; mandatory validation would add compatibility risk without observed benefit.
- Six cold-revived child sessions separately failed because OMP host revival did not reinitialize extension actions. That defect belongs upstream in OMP’s persisted-revive path and is outside this plugin plan.
