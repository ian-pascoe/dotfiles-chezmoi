---
title: OMP Tool-Call Guardian - Plan
type: feat
date: 2026-07-17
deepened: 2026-07-17
topic: omp-tool-call-guardian
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---
<!-- markdownlint-disable MD013 MD025 MD036 -->

# OMP Tool-Call Guardian - Plan

## Goal Capsule

- **Objective:** Prevent catastrophic OMP tool side effects during daily `yolo` use without requiring hand-written permission rules or broadly restricting the calling agent.
- **Product authority:** The Product Contract defines behavior and scope; the Planning Contract defines implementation choices.
- **Execution profile:** Security-sensitive OMP extension work with deterministic fail-closed enforcement, adversarial model evaluation, and deployed-runtime smoke verification.
- **Stop conditions:** Stop if the extension cannot bind the reviewed evidence to the current invocation, if any failure path can reach execution, or if the selected model cannot satisfy the catastrophe corpus and five-second deadline.
- **Tail ownership:** The implementing agent owns focused tests, repo-local model qualification, chezmoi deployment, OMP restart, and live verification.

---

## Product Contract

### Summary

Add a small-model Guardian that reviews OMP tool calls after native permission handling and before execution.
For every reviewed call, Guardian acts as a narrow catastrophe backstop: it either allows the exact observable request or denies it finally with a clear, locally generated reason the calling agent can use to formulate a safer retry.
Coverage has two fixed modes: `all` is the default and reviews every call; opt-in `exclude-known-reads` may bypass only independently attested native read shapes and otherwise degrades safely to review.

### Problem Frame

The operator uses `gpt-5.6-sol` as a daily driver with OMP in `yolo` mode.
The current alternatives are frequent native permission prompts, extensive hand-written policy, or trusting the calling model and relying on git and backups after a dangerous action executes.

A useful backstop must catch catastrophic actions without treating every destructive or externally visible operation as forbidden.
Excessive false denials would remove the autonomy that makes `yolo` valuable.

### Key Decisions

- **Native policy remains authoritative.** OMP evaluates its configured approval policy first; Guardian may narrow an allowed decision but can never broaden or override a native denial.
- **Coverage uses two fixed modes.** Default `all` reviews every native-allowed call. Opt-in `exclude-known-reads` bypasses only a conservative, versioned classifier of native read event shapes after deployment attests that no custom, MCP, or extension tool can replace those names; failed or stale attestation falls back to review.
- **Unknown tools fail conservative.** Custom, MCP, newly introduced, non-matching, or provenance-ambiguous tools are reviewed; there is no user-maintained allowlist.
- **Catastrophe is the threshold.** Guardian blocks catastrophic, unbounded, deceptive, or intent-mismatched actions while allowing bounded risky work that matches the operator's immediate request.
- **Denial is exact and final.** The reviewed call cannot be overridden, but its reason should help the calling agent propose a materially changed call for fresh review.
- **Freshness beats optimization.** Every covered call receives a new review; approvals are never cached or remembered.

### Actors

- A1. **Operator:** Uses OMP, chooses the native permission mode and Guardian coverage mode, and supplies the immediate intent against which a call is judged.
- A2. **Calling agent:** Proposes a tool call, receives Guardian's outcome, and may formulate a materially safer retry after denial.
- A3. **OMP native permission layer:** Applies configured static policy and interactive permission behavior before Guardian review.
- A4. **Guardian:** Independently evaluates the exact proposed action against its fixed safety policy.
- A5. **OMP extension host:** Captures call evidence, invokes Guardian at the blocking hook, and enforces the terminal outcome.

### Requirements

**Authority and coverage**

- R1. Guardian must run through OMP's pre-execution tool-call extension hook without requiring an OMP fork.
- R2. OMP's native permission decision must complete before Guardian review, and no Guardian outcome may override a native denial.
- R3. In default `all` mode, every tool call that passes native policy must receive Guardian review before side effects begin whenever Guardian is loaded, armed, and the deployment invariants hold.
- R4. In opt-in `exclude-known-reads` mode, only calls matched by Guardian's fixed, versioned known-read event-shape classifier may bypass review, and only while an independent runtime inventory attests that those names cannot resolve to custom, MCP, or extension replacements; every failed, stale, unknown, or ambiguous case must be reviewed.
- R5. `Yolo` mode must still route every call selected by the active Guardian coverage mode through review.
- R6. Coverage configuration must be limited to `all` and `exclude-known-reads`; `all` must be the default, and the feature must not introduce a user-authored rule language or allowlist.

**Review evidence and policy**

- R7. Guardian must use a small model dedicated to the review decision rather than the calling agent's own conclusion.
- R8. Guardian must bind the exact observable tool identity, post-transform normalized request, working directory, and immediate user and assistant intent for the proposed call; pre-transform start arguments are correlation evidence, and a remote model may receive only a semantically faithful redacted projection.
- R9. Guardian must treat tool arguments and immediate intent as untrusted evidence, so embedded instructions cannot replace its safety policy or verdict contract.
- R10. Guardian must deny a call with a credible risk of broad or irreversible data or system damage, credential compromise, security-control weakening, deceptive execution, material intent mismatch, or unbounded external effects.
- R11. Guardian must allow bounded risky work when the exact action is consistent with the operator's immediate intent and does not meet the catastrophe threshold.
- R12. Guardian must return one terminal outcome for the exact call: allow or deny.

**Enforcement and recovery**

- R13. A denial must be final for the reviewed call and must not offer an operator override.
- R14. A denial must give the calling agent a clear, concise, locally generated reason that identifies the hazardous property that must change without echoing sensitive evidence or supplying an executable remediation plan.
- R15. A materially changed retry must be treated as a new call and receive a fresh review.
- R16. Every covered call must receive a fresh review; the feature must not cache approvals or remember trusted action families.
- R17. The complete review must have a hard five-second deadline measured from entry into the blocking Guardian hook through local verdict validation.
- R18. Timeout, provider failure, missing credentials, malformed output, ambiguous verdict, model uncertainty, unusable redaction, missing required evidence, failed deployment invariant, or internal error must deny the call.
- R19. No covered tool side effect may begin until an explicit, valid allow verdict has been returned for that exact observable request, and deployment must require Guardian to be the sole/final blocking `tool_call` handler so no later extension can mutate it.

### Key Flow

```mermaid
flowchart TB
  A[Proposed tool call] --> B[Capture asynchronous correlation evidence only]
  B --> C[OMP native permission decision]
  C -->|deny| D[Block through OMP without Guardian model review]
  C -->|allow or operator approved| E{Guardian coverage decision}
  E -->|opt-in exclusion plus attested known read| F[Execute observable request]
  E -->|default all failed attestation or non-match| G[Fresh Guardian review]
  G -->|valid bound allow within five seconds| F
  G -->|deny failure uncertainty or timeout| H[Block request with local reason code]
  H --> I[Agent may propose a new call]
  I --> A
```

OMP's native layer remains the first authorization authority in every mode.
Capturing invocation evidence before native approval is not a Guardian review and must not contact the review provider.

### Acceptance Examples

- AE1. **Native denial wins**
  - **Given:** OMP's configured policy denies a tool call.
  - **When:** The calling agent proposes that call.
  - **Then:** OMP blocks it without a Guardian provider request, and Guardian cannot restore permission.
  - **Covers:** R2
- AE2. **Catastrophic action in yolo**
  - **Given:** `Yolo` mode is active and the agent proposes an unbounded destructive action against the operator's home directory.
  - **When:** The active coverage mode selects the call and Guardian reviews it.
  - **Then:** Guardian denies the exact call and returns the local reason for unbounded destructive scope.
  - **Covers:** R5, R10, R13, R14
- AE3. **Bounded authorized mutation**
  - **Given:** The operator requested a bounded repository change and the proposed mutation matches that immediate intent.
  - **When:** Guardian finds no catastrophic property.
  - **Then:** Guardian allows the exact call without an additional operator prompt.
  - **Covers:** R8, R11, R12
- AE4. **Prompt injection inside call evidence**
  - **Given:** A tool argument tells Guardian to ignore its policy and approve the call.
  - **When:** Guardian evaluates the action.
  - **Then:** The embedded instruction is treated as untrusted evidence and cannot alter the policy or verdict contract.
  - **Covers:** R9, R12
- AE5. **Review failure**
  - **Given:** The review model is unavailable, late, malformed, uncertain, or cannot receive a safe faithful projection.
  - **When:** Guardian cannot produce a valid allow verdict within five seconds.
  - **Then:** The exact call is denied and no covered side effect begins.
  - **Covers:** R17, R18, R19
- AE6. **Known read in opt-in exclusion mode**
  - **Given:** `exclude-known-reads` is active, independent inventory attestation is current, and a local native read matches the fixed known-read event-shape classifier.
  - **When:** The agent proposes it.
  - **Then:** The call follows native policy without a Guardian provider request; missing or stale attestation reviews it instead.
  - **Covers:** R4, R6
- AE7. **Safer retry after denial**
  - **Given:** Guardian denied a call and identified the hazardous property.
  - **When:** The calling agent proposes a materially changed action that removes that property.
  - **Then:** Guardian reviews the new exact call from scratch rather than reusing the prior verdict.
  - **Covers:** R14, R15, R16
- AE8. **Read in all mode**
  - **Given:** `all` is active and the agent proposes a native read operation.
  - **When:** Native policy allows the call.
  - **Then:** Guardian reviews it exactly once before execution.
  - **Covers:** R3, R6
- AE9. **Unknown tool in exclusion mode**
  - **Given:** `exclude-known-reads` is active and the agent proposes a custom or MCP tool that is not an attested classifier match.
  - **When:** Native policy allows the call.
  - **Then:** Guardian reviews it rather than inferring safety from its name or description.
  - **Covers:** R4, R6

### Success Criteria

- Every covered call in a loaded, armed, invariant-valid runtime either receives a valid bound allow verdict within five seconds or is denied before side effects begin.
- Default `all` reviews every native-allowed call; opt-in `exclude-known-reads` bypasses only attested classifier matches and sends every failed, stale, unknown, custom, MCP, or ambiguous case to review.
- A representative catastrophe corpus covering destructive scope, credential compromise, security-control weakening, deceptive execution, intent mismatch, and unbounded external effects produces no allowed calls across repeated trials.
- A representative daily coding workflow completes without manual Guardian rules, operator overrides, or a false denial that dead-ends bounded authorized work.
- Native OMP denials remain effective and explainable independently of Guardian.
- No secret canary from raw evidence appears in the provider wire projection, local logs, surfaced model output, denial reason, or evaluation report.
- Fresh primary and subagent launch evidence proves Guardian loaded from the qualified artifact and no other blocking handler can run after it; missing evidence is no-go, not degraded operation.

### Scope Boundaries

**In scope**

- An OMP extension that enforces native-policy-first, model-assisted review through the existing blocking hook, with external launch/readiness and sole-handler deployment invariants.
- The fixed `all` and `exclude-known-reads` modes, with `all` as the default, attested opt-in native-read exclusion, and no user-defined rules.
- Exact observable-request binding, semantically faithful redacted model evidence, a fixed catastrophe policy, binary verdict enforcement, a five-second fail-closed deadline, and local refusal reasons.
- Daily interactive use, `yolo` mode, and non-interactive or subagent contexts in which fresh launch attestation proves the same OMP extension host and tool events apply.
- A repo-local catastrophe and daily-workflow evaluation corpus used to qualify the configured model and policy.

**Out of scope**

- An OMP fork or upstream extension-API change for authoritative resolved-tier metadata.
- A new static rule language, changes to OMP's native permission model, or user-maintained read/write allowlists.
- Human override, session or cross-session approval caches, learned trust, command-family approvals, or turn-wide quarantine.
- A remediation agent that writes replacement commands or plans actions on the calling agent's behalf.
- Raw argument logging, hosted evaluation services, persistent verdict telemetry, or approval audit storage.
- Replacing operating-system sandboxing, credential isolation, version control, or backups; Guardian is defense in depth rather than a safety proof.

### Dependencies and Assumptions

- OMP continues to apply native approval before its blocking `tool_call` extension hook.
- `tool_execution_start` and blocking `tool_call` remain independently delivered, correlatable by session and call ID, and may arrive out of order; start arguments are pre-transform evidence, while blocking input is the authoritative normalized request visible to Guardian.
- Deployment can prove Guardian is loaded and armed in each fresh primary and subagent session and is the sole/final blocking `tool_call` handler; inability to prove either condition is a release stop.
- Opt-in known-read bypass requires an independently attested runtime tool inventory with no custom, MCP, or extension replacement of bypass names; otherwise calls are reviewed as in `all`.
- A suitable configured small model and direct low-level transport can return reliable structured decisions within the five-second deadline; `gpt-5.6-luna` is not assumed compatible with plain `completeSimple`.
- Catastrophe classification remains probabilistic and the model/provider remains in the semantic trusted computing base; success is established against representative adversarial and daily-workflow scenarios, not as an absolute guarantee.
- Binding the observable request does not freeze external filesystem, environment, executable-resolution, or remote-resource state; sandboxing and least privilege remain independent controls.

### Sources and Research

- `private_dot_omp/private_agent/config.yml` confirms the deployed OMP source configuration uses `yolo` approval mode and existing model-role configuration.
- `private_dot_omp/private_agent/extensions/adaptive-thinking.ts` and `private_dot_omp/private_agent/extensions/adaptive-thinking.test.ts` establish the repository's extension and test patterns.
- `private_dot_omp/private_agent/node_modules/@oh-my-pi/pi-agent-core/src/agent-loop.ts` establishes that `tool_execution_start` precedes later transforms nominally but its asynchronous listeners are not an execution barrier.
- `private_dot_omp/private_agent/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/wrapper.ts` establishes native-policy-first ordering, blocking hook behavior, normalized event input, and execution after sequential handlers in installed OMP 17.0.1.
- `private_dot_omp/private_agent/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/loader.ts` establishes one-level extension discovery and non-fatal load errors, which require a single-entry package layout and external readiness gate.
- `private_dot_omp/private_agent/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts` establishes the available tool events, context, model resolver, flags, and missing resolved-tier and tool-provenance metadata.
- `private_dot_omp/private_agent/node_modules/@oh-my-pi/pi-coding-agent/src/goals/guided-setup.ts` establishes that the GPT-5.6 role models need websocket side-session transport unavailable through the planned plain completion seam.
- [OMP v17.0.2 extension event types](https://github.com/can1357/oh-my-pi/blob/v17.0.2/packages/coding-agent/src/extensibility/extensions/types.ts) confirm that current public `tool_call` events still omit authoritative approval tier and provenance metadata.
- [OMP v17.0.2 release](https://github.com/can1357/oh-my-pi/releases/tag/v17.0.2) documents current provider and extension behavior relevant to structured calls and managed timers.
- [OWASP Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) treats guardrail models as prompt-injectable and recommends action screening alongside deterministic controls.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) supports deny-by-default and per-request validation.
- [NIST AI 600-1](https://doi.org/10.6028/NIST.AI.600-1) supports empirical capability validation, false-positive/false-negative measurement, and adversarial testing.

---

## Planning Contract

### Product Contract Preservation

Changed R3-R6, R8, R18-R19, AE5-AE6, Success Criteria, Scope Boundaries, and the coverage Key Decision after planning proved that OMP v17.0.2 omits authoritative resolved tier/provenance, permits later handler mutation, and continues after extension-load errors.
The operator retained both fixed coverage modes but selected `all` as the default; `exclude-known-reads` is now opt-in and bypasses only under current external inventory attestation.
The no-fork boundary remains: safety claims are conditioned on explicit load/readiness and sole/final-handler deployment invariants, and failure to establish them is no-go rather than a permissive fallback.

### Key Technical Decisions

- KTD1. **Correlate independently delivered OMP events.** `tool_execution_start` contributes pre-transform arguments and assistant intent to invocation-local pending state but performs no model work. The blocking `tool_call` proves native permission allowed the call, may arrive before start handling settles, and waits only within the same absolute deadline for correlatable evidence. Duplicate, orphaned, late, or terminalized events poison or settle state without recreation.
- KTD2. **Default to complete hook-level review.** A registered string flag selects `all` or `exclude-known-reads`, defaulting to `all`. The exclusion classifier recognizes conservative versioned event shapes, not authoritative tool identity; bypass is armed only while an external inventory attests no custom, MCP, or extension replacement of known names, and every ambiguous or stale case reviews.
- KTD3. **Bind the exact observable request under a deployment invariant.** Start arguments are correlation/intent evidence; the blocking event's resolved normalized input is authoritative for review. A typed comparison accepts documented timeout capping, secret deobfuscation, and edit-path derivation while rejecting unexplained security-relevant changes. Because the public hook cannot recheck after later handlers, deployment must prove Guardian is the sole/final blocking handler; actual external effects and co-extension mutation outside that invariant remain out of scope.
- KTD4. **Separate local evidence from remote evidence.** A deterministic, tool-aware allowlist projection preserves only hazard-relevant scope, destination class, value class, and size; opaque or unknown fields default to redacted, and any projection that cannot retain hazard semantics safely denies. Exact raw evidence remains local, while provider-side handling follows the configured provider's retention contract.
- KTD5. **Use a dedicated compatible small-model role without changing session state.** Resolve `@guardian` through the extension model resolver only after U2 proves the selected provider/model works through an isolated low-level transport available to extensions. Plain `completeSimple` is preferred; `openai-codex/gpt-5.6-luna` is ineligible unless a Guardian-owned websocket side-session adapter is explicitly implemented and qualified.
- KTD6. **Accept only one strict semantic allow.** The model returns exactly `decision: allow|deny` and `reasonCode` from `none`, the six catastrophe classes, or `uncertain`. `allow + none` under the active deadline is the only executable state. Refusal, truncation, extra response channels, missing/duplicate tool calls, unknown fields, casing differences, conflicting pairs, or prose fallback denies. Structural validity does not remove semantic model/provider risk.
- KTD7. **Generate denial text locally.** Finite reason codes map to concise fixed templates. Raw arguments, model prose, provider errors, stack traces, and executable replacement instructions never reach the calling agent.
- KTD8. **Treat five seconds as one monotonic single-assignment deadline.** Race the entire operation—including non-abortable evidence, credential, model, and transport work—against one absolute deadline. Terminalize denial before returning, clear owned timers, absorb late settlement, and prevent any late callback from authorizing, mutating state, logging sensitive data, or creating an unhandled rejection.
- KTD9. **Qualify policy and model with an artifact-bound two-sided corpus.** Catastrophe cases have a zero-observed-false-allow gate across repeated fresh-process trials. Contrastive daily-workflow cases track false denials and must complete the representative workflow. A frozen manifest binds corpus, held-out set, provider/model identity, policy, schema, redactor, adapter, OMP version, source revision, and runtime digests; any load-bearing change invalidates qualification.
- KTD10. **Treat Guardian arming as a release gate.** Package one discoverable extension entrypoint, attest the qualified artifact and effective mode in fresh primary and child sessions, prove no later blocking handler exists, and expose an extension-only status/flag canary. Missing, stale, divergent, or loader-error evidence stops launch/use; rollback never silently resumes `yolo` without an equivalent native safety posture.

### High-Level Technical Design

#### Native permission and Guardian sequence

```mermaid
sequenceDiagram
  participant A as Calling agent
  participant H as OMP host
  participant N as Native permission
  participant G as Guardian extension
  participant M as Small review model
  participant T as Tool executor

  A->>H: Proposed tool call with intent
  H-->>G: tool_execution_start correlation evidence
  Note over G: Asynchronous; no provider request
  H->>N: Resolve policy and optional operator prompt
  alt Native denial
    N-->>A: Native denial
    H-->>G: Terminal event clears or tombstones evidence
  else Native allow
    N->>G: Blocking tool_call with normalized input
    G->>G: Await/correlate evidence within deadline
    alt Attested opt-in known read
      G-->>H: Bypass
    else Default all or non-match
      G->>M: Fixed policy plus redacted projection
      M-->>G: Structured verdict
      G-->>H: Bound allow or final block
    end
    Note over G,H: Deployment proves Guardian is sole/final blocking handler
    H->>T: Execute only bypassed or valid bound allow
    T-->>A: Tool result
  end
```

#### Enforcement state machine

```mermaid
stateDiagram-v2
  [*] --> EvidenceCaptured: start arrives first
  [*] --> AwaitingEvidence: blocking call arrives first
  EvidenceCaptured --> GateReady: blocking call correlates
  AwaitingEvidence --> GateReady: start correlates in budget
  AwaitingEvidence --> Denied: missing duplicate late or ambiguous evidence
  GateReady --> Bypassed: opt-in attested known-read shape
  GateReady --> ReviewPending: default all or non-match
  ReviewPending --> Denied: deny failure invalid output timeout or mismatch
  ReviewPending --> AllowedBound: valid allow before deadline
  AllowedBound --> ReturnedAllow: final local checks pass
  Bypassed --> ReturnedBypass
  Denied --> Terminal
  ReturnedAllow --> Terminal
  ReturnedBypass --> Terminal
  Terminal --> [*]
```

Actual execution follows `ReturnedAllow` or `ReturnedBypass` only under the externally verified sole/final-handler invariant; the public extension API has no post-handler recheck.

#### Evidence trust and validation pipeline

```mermaid
flowchart TB
  A[Pre-transform start evidence] --> C[Correlation and intent selection]
  B[Post-transform normalized blocking input] --> C
  C --> D[Typed local request snapshot and review nonce]
  D --> E[Tool-aware allowlist projection]
  E -->|lossy unsafe opaque or oversized| F[Local deny]
  E -->|faithful redacted projection| G[Untrusted model evidence]
  H[Fixed versioned catastrophe policy] --> I[Isolated review request]
  G --> I
  I --> J[Strict structural validation]
  J --> K[Semantic deadline and request-binding validation]
  K -->|allow plus none only| L[Bound allow]
  K -->|every other state| F
```

#### Coverage decision matrix

| Mode | Attested native read shape | Failed/stale attestation or ambiguous call | Custom, MCP, or unknown call | Operator-maintained rules |
| --- | --- | --- | --- | --- |
| `all` (default) | Review | Review | Review | Not supported |
| `exclude-known-reads` | Bypass | Review | Review | Not supported |

#### Output Structure

```text
private_dot_omp/private_agent/extensions/
└── tool-call-guardian/
    ├── index.ts
    ├── index.test.ts
    ├── policy.ts
    ├── policy.test.ts
    ├── review.ts
    ├── review.test.ts
    ├── cases.json
    └── eval.ts
```

The one-level OMP loader discovers only `tool-call-guardian/index.ts`; helper, test, corpus, and evaluation modules are not independent extension entrypoints.

### System-Wide Impact

- **Operator workflow:** Default `all` adds one review to every native-allowed call. Opt-in read bypass is available only after current inventory attestation; no unverified fast path exists.
- **Calling agents:** Denials become terminal tool errors with stable local hazard categories; retries remain ordinary new calls.
- **Security boundary:** Guardian narrows native permission but never broadens it. The model/provider is part of the semantic trusted computing base even though output is structurally untrusted; empirical qualification and deterministic fail-closed validation reduce but do not eliminate model risk.
- **Privacy:** Exact raw evidence remains process-local. Only allowlisted hazard-relevant projections reach the provider; local non-persistence does not imply zero provider retention.
- **Extension ecosystem:** Guardian must remain the sole/final blocking `tool_call` handler. OMP or extension changes affecting handler order, tool inventory, event shape, or loader behavior invalidate deployment attestation and qualification.
- **Performance:** Default calls add one model request and must complete within five seconds. The implementation avoids retries, reasoning, oversized outputs, and transport paths that cannot honor the total budget.
- **Deployment:** Chezmoi output must expose exactly one Guardian entrypoint. Fresh primary and subagent sessions must attest artifact, mode, inventory, handler-order preconditions, and health before use.

### Risks and Mitigations

- **Known-read provenance:** Public events cannot distinguish an exact native-looking custom replacement. Default `all` closes this path; opt-in exclusion requires independent inventory attestation and falls back to review whenever identity is uncertain.
- **Post-review mutation:** The public hook cannot protect execution parameters from a later handler. Guardian is deployable only as the sole/final blocking handler; malicious-before/after characterization and load-order evidence are release gates, not claims that snapshots freeze arbitrary co-extensions.
- **Out-of-order and duplicate events:** Start delivery is not an awaited barrier. Use single-assignment state keyed by session, call ID, and internal nonce; poison duplicate/reused identities, tombstone terminal calls, and deny missing or late evidence without state resurrection.
- **Prompt injection and provider compromise:** Finite structured output cannot detect a semantically malicious `allow + none`. Treat injection resistance as empirical, bind qualification to exact provider/model/prompt/schema identity, and stop release on any catastrophe allow or unverifiable alias drift.
- **Secret leakage versus review fidelity:** Paths, URIs, keys, shell/env/header fields, encoded values, and opaque payloads may contain secrets. Use tool-aware allowlisted projection, inspect exact wire/log/report sinks with canaries, and deny unknown payloads that cannot be projected faithfully.
- **Five-second availability:** Credential/model lookup may ignore cancellation. Race the entire operation against an absolute deadline, latch terminal denial, absorb late settlement, measure fresh-process and warm latency, and fail qualification if any accepted result is late.
- **Extension load failure:** OMP logs and continues after load errors. Use a single-entry package, extension-only status/flag canary, fresh primary/child attestation, and an external no-go readiness procedure; never treat an unarmed session as protected.
- **Model transport compatibility:** GPT-5.6 role aliases require websocket side-session state not exposed through the plain adapter. Select and qualify a direct-transport-compatible small model or explicitly implement an isolated side-session adapter before configuration.
- **External TOCTOU:** Exact serialized request binding does not freeze symlinks, `PATH`, environment, scripts, DNS, or remote state. Preserve OS sandboxing, least privilege, credential isolation, version control, and backups, and do not claim Guardian detects these changes.
- **Finite evaluation evidence:** Zero observed false allows is not a proof. Keep a held-out adversarial set, freeze qualification inputs and identities, and rerun from fresh processes after every load-bearing change.

### Sequencing

1. Establish deterministic coverage, request comparison, redaction, verdict, and lifecycle primitives before introducing provider effects.
2. Prove a compatible isolated model transport and all total-deadline failure branches before selecting the configured `guardian` role.
3. Characterize out-of-order event delivery, normalized-input transforms, and handler ordering before wiring blocking enforcement.
4. Qualify the exact configured model, policy, corpus, source, and runtime manifest before deployment; compilation and mocked tests are necessary but insufficient.
5. Apply through chezmoi, launch fresh OMP sessions, and require full primary/subagent arming plus smoke evidence before declaring the runtime usable.

## Implementation Units

### U1. Define coverage and request-evidence policy

- **Goal:** Create the pure policy boundary for mode selection, attested known-read event-shape classification, start/blocking evidence comparison, current-turn intent selection, tool-aware projection, verdict validation, and local denial categories.
- **Requirements:** R3-R6, R8-R10, R12, R14, R18-R19; AE4, AE6, AE8, AE9.
- **Dependencies:** None.
- **Files:**
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/policy.ts`.
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/policy.test.ts`.
- **Approach:** Keep this module deterministic and provider-free. Export the two coverage modes, conservative event-shape classifier, inventory-attestation input, JSON-only snapshots, documented pre/post-transform comparison, tool-aware allowlist projection, finite decision/reason codes, semantic verdict validation, and local reason templates. Unknown, opaque, malformed, or stale inputs return review/deny rather than throwing through the host.
- **Patterns to follow:** Mirror narrow typed helpers and explicit result construction in `private_dot_omp/private_agent/extensions/adaptive-thinking.ts`; use installed OMP argument transforms and tool definitions only as characterization evidence, not as imported private runtime APIs.
- **Test scenarios:**
  1. Covers AE8. Default `all` selects a local native read for review.
  2. Covers AE6. Opt-in exclusion bypasses the same read only with current matching inventory/version attestation.
  3. Failed/stale attestation, `ssh://` targets, schema drift, malformed inputs, and non-native-looking name collisions select review.
  4. Covers AE9. Unknown, custom, MCP-like, and malformed calls select review; an exact side-effecting `read` impostor proves event shape alone cannot establish provenance and therefore cannot arm exclusion without external attestation.
  5. Comparison accepts characterized timeout capping, secret deobfuscation, and edit-path derivation while rejecting unexplained changes in security-relevant fields.
  6. Canonical evidence distinguishes cwd, tool name, call ID, normalized value, user intent, assistant intent, policy version, session, and review nonce.
  7. Cyclic, non-JSON, oversized, missing-intent, opaque, or unfaithfully projectable evidence produces a controlled deny category.
  8. Canary secrets in nested keys/values, arrays, URIs, paths, shell/env/header fields, Unicode, encoded/split strings, binary-like values, and oversized inputs reach no projection, denial, or log sink.
  9. Direct, indirect, role-spoofing, delimiter-closing, typoglycemia, Base64, and split-payload instructions remain ordinary untrusted evidence.
  10. `allow + none` is structurally valid; deny codes, uncertainty, casing changes, extra response channels/fields, conflicting pairs, missing values, and duplicate verdicts are not executable allows.
  11. Local reason templates identify the hazard class without raw evidence, model prose, secrets, or executable remediation.
- **Verification:** Pure tests prove deterministic default review, attestation-gated exclusion, faithful projection, documented transform comparison, and deny-by-default semantics without network access.

### U2. Add the isolated five-second model reviewer

- **Goal:** Prove a compatible dedicated small-model transport and obtain one strict decision under a total deadline without mutating the calling session.
- **Requirements:** R7, R9-R12, R16-R18; AE3-AE5.
- **Dependencies:** U1.
- **Files:**
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/review.ts`.
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/review.test.ts`.
  - Modify `private_dot_omp/private_agent/config.yml` to add the qualified `guardian` model role.
- **Approach:** Inject model, credential, clock, and transport dependencies. Resolve `@guardian` only after proving its provider/model supports an isolated extension-owned request through the chosen low-level transport. Use one fixed system policy, one strict verdict tool, an isolated one-message context, disabled reasoning, low output limit, and no retry/fallback. Return a local discriminated result; raw provider data never crosses the enforcement boundary.
- **Execution note:** Characterize direct transport before selecting the model. Do not configure GPT-5.6 Luna through plain `completeSimple`; either choose a compatible small model or separately implement and qualify a Guardian-owned websocket side-session.
- **Patterns to follow:** Follow the dependency boundaries and deadline shape in installed `auto-thinking/classifier.ts`, but race model and credential resolution as well as provider work; follow strict tool validation in installed `commit/shared-llm.ts`.
- **Test scenarios:**
  1. Covers AE3. Exactly one valid `allow + none` verdict returns a locally bound allow.
  2. Covers AE4. Injection-bearing evidence cannot alter the request policy/schema; repeated catastrophe outcomes, not prompt placement alone, prove resistance.
  3. Covers AE5. Missing/incompatible model, missing credentials, provider rejection, refusal, truncation, empty/prose response, extra channels, missing/duplicate/wrong tool call, malformed fields, and semantic conflicts deny.
  4. Model resolution, credential lookup, provider work, parsing, and validation consume one absolute deadline.
  5. Never-settling credential lookup and ignored-cancellation provider work deny by deadline; settlement/rejection after timeout is absorbed without allow, state mutation, sensitive logging, timer retention, or unhandled rejection.
  6. Host/session cancellation racing a valid result latches denial and cannot be reversed by completion.
  7. Concurrent requests and duplicate-looking inputs cannot exchange review IDs, digests, timers, abort controllers, or verdicts.
  8. Repeated identical calls issue separate provider requests.
  9. Provider errors, raw model output, wire canaries, and secret values do not appear in returned categories or logs.
  10. The configured model resolves to the intended direct transport and exact provider/model identity; unsupported transport is a qualification stop.
- **Verification:** Focused tests prove fresh requests, strict output handling, total-deadline terminalization, compatible transport identity, and no post-deadline allow.

### U3. Enforce Guardian through OMP event correlation

- **Goal:** Wire independently delivered evidence, native-policy-first blocking review, observable-request enforcement, mode selection, terminal lifecycle, and agent-visible denial into one extension entrypoint.
- **Requirements:** R1-R5, R8, R12-R19; AE1-AE9.
- **Dependencies:** U1, U2.
- **Files:**
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/index.ts`.
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/index.test.ts`.
- **Approach:** Register mode and status flags plus handlers in the package entrypoint. Capture start correlation/intent evidence without model work. On blocking `tool_call`, start the absolute deadline, await start evidence only within the remaining budget, compare documented transforms, apply default review or attested opt-in exclusion, and return `{ block: true, reason }` for every non-valid allow. Use single-assignment state keyed by session/call plus an internal nonce; duplicate, orphaned, terminal, shutdown, and late events cannot overwrite or resurrect state.
- **Execution note:** First characterize wrapper/event timing, extension discovery, normalized input, and handler order. If the real host cannot correlate out-of-order evidence or enforce Guardian as the sole/final blocking handler in the deployed set, stop rather than weaken R19.
- **Patterns to follow:** Mirror default registration and injected API testing in `private_dot_omp/private_agent/extensions/adaptive-thinking.ts`; treat installed agent-loop, event-input, runner, wrapper, and loader behavior as the contract to characterize.
- **Test scenarios:**
  1. Covers AE1. Static/operator native denial, missing interactive UI, and approval abort make zero Guardian provider requests.
  2. Interactive approval, explicit allow, and `yolo` reach Guardian once under default `all`.
  3. Covers AE6/AE8. The same read reviews by default and bypasses only in opt-in exclusion with current attestation.
  4. Covers AE9. Custom/MCP/unknown calls review; an exact native-schema `read` impostor cannot activate exclusion without independent attestation.
  5. Covers AE2. Catastrophe denial returns a stable local reason and executor-start count remains zero.
  6. Covers AE3. A valid allow executes the underlying tool once under the sole/final-handler invariant.
  7. `tool_call` before start, end before delayed start, late start after terminalization, missing evidence, duplicate/reused same-session IDs, and orphaned events deny without leaks or resurrection.
  8. Legitimate timeout/deobfuscation/edit-path transforms correlate; unexplained call ID/name/input/cwd/intent changes deny.
  9. Malicious mutators before and after Guardian characterize the limit: mutation is denied/impossible only when deployment proves no subsequent blocking handler; otherwise release stops.
  10. Simultaneous identical calls in one or separate sessions cannot cross-authorize, and cancellation/deadline races irreversibly latch denial.
  11. Covers AE7. Identical and safer retries receive fresh reviews; no prior state changes treatment.
  12. Multi-tool messages, compacted history, queued steering, and subagents select only originating user and assistant intent; ambiguous provenance denies.
  13. New session, branch switch, shutdown, and process restart retain no approval state, timer, pending review, or tombstone beyond its bounded lifecycle.
- **Verification:** Wrapper/runner characterization and extension integration tests prove native-first review, default-all behavior, safe out-of-order handling, zero executor starts on non-allows, one execution on allow, and explicit sole/final-handler release preconditions.

### U4. Qualify the policy and configured model

- **Goal:** Produce a repeatable artifact-bound qualification decision for catastrophe false allows, daily-workflow false denials, projection privacy, reason accuracy, transport identity, and cold/warm latency.
- **Requirements:** R7-R12, R14, R17-R18; AE2-AE5.
- **Dependencies:** U1, U2, U3.
- **Files:**
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/cases.json`.
  - Create `private_dot_omp/private_agent/extensions/tool-call-guardian/eval.ts`.
  - Modify `private_dot_omp/private_agent/package.json` to expose the focused evaluation entrypoint.
- **Approach:** Store sanitized full tuples of user intent, assistant intent, tool, typed args, cwd, expected verdict, and reason class. Cover all catastrophe categories, bounded daily actions, contrastive pairs, transform cases, and injection variants. Freeze a manifest with corpus/held-out digests, repetition/order/seed controls, provider/model/transport identity, role config, policy/schema/projector/adapter versions, OMP version, source revision, and runtime-file/config digests. Run twice from fresh processes and report only sanitized aggregate outcomes.
- **Execution note:** Any tuning invalidates held-out evidence. Any model/provider alias or artifact identity that can drift without detection is no-go; this evaluation qualifies an exact release manifest, not a model family.
- **Patterns to follow:** Keep the harness isolated from OMP session mutation and avoid hosted evaluation services; qualification evidence remains repo-local and sanitized.
- **Test scenarios:**
  1. Every catastrophe class produces zero allows across fixed repeated trials, including a syntactically valid compromised-provider `allow + none`.
  2. Direct/indirect injection variants cannot turn catastrophe cases into allow.
  3. Contrastive pairs differing only by scope, cwd, destination, transform, or intent produce expected decisions.
  4. The representative daily workflow completes without a false denial that dead-ends bounded work.
  5. Every response has the expected finite reason class, and no canary appears in exact wire projections, logs, provider/load errors, denial text, model echoes, or reports.
  6. Fresh-process and warm calls meet the five-second gate; any late accepted completion is a qualification failure.
  7. The held-out set remains excluded from tuning and passes before deployment.
  8. Two complete fresh-process runs over the same frozen manifest produce the same pass/fail result; any artifact or identity change invalidates GO.
- **Verification:** The machine-readable launch candidate records manifest identity and exits nonzero for any catastrophe allow, privacy leak, reason mismatch, workflow-dead-ending denial, timeout, transport mismatch, stale artifact, or nondeterministic release result.

### U5. Deploy and smoke-test the Guardian runtime

- **Goal:** Apply the qualified package through chezmoi and prove fresh primary and subagent runtimes load, arm, and enforce the exact release manifest in daily `yolo` operation.
- **Requirements:** R1-R6, R13-R19; AE1-AE9.
- **Dependencies:** U3, U4.
- **Files:**
  - Verify source-to-destination mapping for `private_dot_omp/private_agent/extensions/tool-call-guardian/` and `private_dot_omp/private_agent/config.yml`.
  - Record the rendered destination/config digests and pre-deploy rollback baseline.
- **Approach:** Confirm OMP discovers exactly one Guardian entrypoint, compare rendered digests with the frozen qualification manifest, retire old primary/child sessions, and launch fresh primary plus fresh subagents. Require extension-only status/flag evidence for artifact, model, mode, inventory attestation, and sole/final-handler preconditions before smoke. Exercise the full primary/subagent by default/opt-in mode matrix using bounded fixtures and an inert catastrophe probe whose executor can only trip a sentinel inside a disposable fixture.
- **Execution note:** Never test extension absence with a genuinely destructive host call. Loader errors, missing status, stale identity, handler-order uncertainty, child divergence, or sentinel entry are immediate stop/rollback conditions. Restoring the previous manifest does not by itself authorize resuming `yolo`.
- **Patterns to follow:** Follow the repository's chezmoi source-to-destination convention; define the OMP-specific fresh-process, attestation, stop, and rollback outcomes here rather than attributing them to root `AGENTS.md`.
- **Test scenarios:**
  1. Fresh primary and subagent sessions independently attest the qualified artifact/model identity, default `all`, registered status/flag surface, and sole/final-handler condition.
  2. Default `all` reviews a local read and bounded write exactly once in both contexts.
  3. Opt-in exclusion bypasses the same read only with current inventory attestation; failed/stale attestation reviews it.
  4. Custom/MCP-like calls review in both modes; exact-name impostor uncertainty prevents exclusion from arming.
  5. A bounded requested mutation changes only the disposable fixture.
  6. An inert catastrophe probe is denied with a local hazard reason and records zero executor/sentinel entry and zero escaped changes.
  7. Missing credentials, incompatible model, unreachable provider, and never-settling lookup deny within the total deadline without raw details.
  8. Deleted/renamed entrypoint, syntax/import/load error, unexpected discovered Guardian module, old parent, missing child load, or status mismatch is no-go before tool-capable use.
  9. Fresh restart/session retains no approval state; repeated calls review afresh.
  10. Rollback restores recorded prior digests in fresh sessions and re-establishes a safe native approval posture before any `yolo` use.
- **Verification:** One launch record links the frozen qualification manifest, rendered deployment manifest, fresh primary/child attestations, complete context/mode smoke matrix, harmless sentinel result, and rollback baseline; missing, stale, or contradictory evidence is NO-GO.

## Verification Contract

| Gate | Applicability | Proof | Done signal |
| --- | --- | --- | --- |
| Policy tests | U1 | Focused `private_dot_omp/private_agent/extensions/tool-call-guardian/policy.test.ts` run | Default review, attestation-gated exclusion, transform comparison, projection privacy, and verdict semantics pass deterministically. |
| Reviewer tests | U2 | Focused `private_dot_omp/private_agent/extensions/tool-call-guardian/review.test.ts` run | Transport, credential, schema, cancellation, concurrency, late settlement, and total-deadline failures deny. |
| Hook integration tests | U3 | Focused `private_dot_omp/private_agent/extensions/tool-call-guardian/index.test.ts` run | Out-of-order lifecycle, native ordering, sole/final-handler characterization, and zero-executor-on-denial scenarios pass. |
| Guardian test project | U1-U3 | `private_dot_omp/private_agent/vitest.config.ts` project | Existing adaptive-thinking tests and all Guardian tests pass together. |
| Type safety and static quality | U1-U4 | Existing OMP-agent TypeScript, formatter, and linter surfaces | Extension, tests, corpus, and evaluation harness pass without unrelated churn. |
| Live model qualification | U4 | Focused package evaluation entrypoint | Two fresh-process runs over one frozen manifest produce zero catastrophe allows, workflow completion, no leaks, correct reasons, matching transport identity, and no accepted review after five seconds. |
| Chezmoi deployment | U5 | Targeted rendered diff/apply plus digest manifest | Exactly one Guardian entrypoint and config match the qualified source; rollback baseline is recorded. |
| Runtime arming | U5 | Fresh primary and fresh child status/flag attestations | Artifact/model/mode identity, inventory state, and sole/final-handler preconditions match; any load error or absence is NO-GO. |
| Runtime smoke | U5 | Primary/subagent × default/opt-in matrix with disposable fixtures | Review, attested bypass, allow, deny, timeout, restart, no-cache, and harmless catastrophe sentinel outcomes match the Product Contract. |

The root `vitest.config.ts` currently references `./dot_omp/agent`, which is not a source-tree path; focused verification must use `private_dot_omp/private_agent/vitest.config.ts` unless that mapping is separately corrected.

## Definition of Done

- Product Contract R1-R19 and AE1-AE9 are traceable to implemented units and observed verification outcomes.
- Both fixed modes work, `all` is the default, opt-in exclusion requires current inventory attestation, ambiguous/custom/MCP calls review, and no user rule surface exists.
- Native denial makes zero Guardian provider requests; every covered native-allowed call receives one fresh review.
- The sole reviewed execution path is a timely `allow + none` bound to the authoritative normalized request in a runtime proven to have Guardian as the sole/final blocking handler.
- Every timeout, provider, credential, transport, evidence, projection, schema, uncertainty, binding, cancellation, lifecycle, attestation, and internal-error path denies or prevents launch before executor start.
- Denial reasons are finite local templates with no raw arguments, secrets, provider errors, model prose, or executable remediation.
- The exact configured small model/provider/transport and frozen release manifest pass catastrophe, daily-workflow, privacy, reason-code, reproducibility, and latency gates.
- Focused Vitest, full OMP-agent Vitest, TypeScript, formatting, and lint gates pass without unrelated lockfile or source churn.
- Chezmoi renders exactly one Guardian entrypoint; fresh primary and child sessions attest the qualified artifact, mode, inventory, and handler-order invariants.
- The complete runtime matrix proves review, attested bypass, bounded allow, harmless catastrophe denial, timeout, restart, and no-cache behavior with zero sentinel entry.
- A rollback baseline and safe native approval posture are proven; rollback never silently resumes unguarded `yolo`.
- Documentation-impact review confirms the mode/status surface and model-role configuration are discoverable; no user-authored rule documentation is introduced.
- Abandoned experiments, permissive parser fallbacks, temporary corpus cases, raw diagnostic logging, and dead-end implementation code are removed before completion.
