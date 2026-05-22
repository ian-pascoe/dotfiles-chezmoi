# OpenCode Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Codex-style `/goal` behavior to OpenCode using a plugin-enforced persistent goal loop inspired by `code-yeongyu/pi-goal`.

**Architecture:** A global OpenCode plugin owns goal state, tools, command handling, token accounting, and idle continuation. The model can only inspect goals and mark them complete; user/system commands control create, pause, resume, and clear. Active goals resume on `session.idle` until the persisted state leaves `active`.

**Tech Stack:** OpenCode plugin API, TypeScript, Bun/Node filesystem APIs, OpenCode SDK client, local tests.

---

## Files

- Create `dot_config/opencode/plugins/goal/index.ts`: explicit plugin entrypoint loaded from `opencode.jsonc`, OpenCode plugin implementation, custom tools, command hook, idle watchdog, compaction hook.
- Create `dot_config/opencode/plugins/goal/types.ts`: goal types, status constants, and type guards.
- Create `dot_config/opencode/plugins/goal/validation.ts`: objective and token-budget validation.
- Create `dot_config/opencode/plugins/goal/store.ts`: versioned JSON store with atomic writes and transition helpers.
- Create `dot_config/opencode/plugins/goal/command.ts`: `/goal` argument parser.
- Create `dot_config/opencode/plugins/goal/prompt.ts`: continuation and budget-limit prompts with XML escaping.
- Create `dot_config/opencode/plugins/goal/format.ts`: status and tool response formatting.
- Create `dot_config/opencode/plugins/goal/continuation.ts`: continuation policy predicates.
- Create `dot_config/opencode/plugins/goal/*.test.ts`: tests for parser, store transitions, prompts, continuation policy, and tool contracts.
- Create `dot_config/opencode/commands/goal.md`: user-facing command stub.
- Modify `dot_config/opencode/opencode.jsonc`: add `./plugins/goal/index.ts` to the `plugin` array.
- Modify `dot_config/opencode/package.json`: add a test script if needed.

## Tasks

### Task 1: Goal Core Library

- [ ] Write failing tests for command parsing, validation, prompt escaping, continuation policy, and store transitions.
- [ ] Implement the minimal goal core under `dot_config/opencode/plugins/goal/`.
- [ ] Verify tests pass.

### Task 2: Plugin Enforcement

- [ ] Write failing tests or type-level checks for custom tool contracts and plugin hook export.
- [ ] Implement plugin tools: `create_goal`, `get_goal`, and `update_goal` where `update_goal` only accepts `complete`.
- [ ] Implement `/goal` handling through `command.execute.before`.
- [ ] Implement `session.idle` continuation with per-session reentrancy guard and persisted token accounting.
- [ ] Implement `experimental.session.compacting` goal context injection.

### Task 3: OpenCode Wiring

- [ ] Add `dot_config/opencode/plugins/goal/index.ts` entrypoint.
- [ ] Add `dot_config/opencode/commands/goal.md`.
- [ ] Add `./plugins/goal/index.ts` to `dot_config/opencode/opencode.jsonc` plugin list.
- [ ] Add test script if missing.

### Task 4: Verification And Review

- [ ] Run goal tests.
- [ ] Run `npm run typecheck` in `dot_config/opencode`.
- [ ] Run `npm run lint` in `dot_config/opencode`.
- [ ] Run an independent review.
- [ ] Fix any findings and rerun verification.

## Notes

- Use `client.session.prompt`, not `promptAsync`, for idle continuation.
- Store state under `$XDG_STATE_HOME/opencode-goals` or `~/.local/state/opencode-goals`.
- Hash the canonical project directory for the project key.
- Track `lastAccountedAssistantMessageID` to avoid double-counting tokens.
- Use atomic writes via temporary file plus rename.
- Escape all untrusted prompt content.
- Restart OpenCode after deployment because config, commands, and plugins are startup-loaded.
