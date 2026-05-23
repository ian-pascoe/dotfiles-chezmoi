# OpenCode ast-grep Single Tool Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing OpenCode ast-grep plugin from five top-level tools into one token-efficient `ast_grep` tool with nested operations.

**Architecture:** Keep the current implementation helpers and safety model, but move tool registration behind a single `operation` enum. Preserve preview-first write behavior, `external_directory` permission handling, and edit permission gates.

**Tech Stack:** TypeScript, OpenCode plugin API, ast-grep CLI, Vitest.

---

## Scope

Current tools to collapse:

- `ast_grep_search`
- `ast_grep_replace`
- `ast_grep_scan`
- `ast_grep_rule_test`
- `ast_grep_debug_pattern`

Replacement tool:

- `ast_grep`

Supported operations:

- `search`
- `replace`
- `scan`
- `ruleTest`
- `debugPattern`

## Tool Contract

### `ast_grep`

Common inputs:

- `operation: "search" | "replace" | "scan" | "ruleTest" | "debugPattern"`
- `pattern?: string`
- `rewrite?: string`
- `lang?: string`
- `paths?: string[]`
- `globs?: string[]`
- `strictness?: string`
- `max_results?: number`
- `context?: number`
- `apply?: boolean`
- `rule_file?: string`
- `inline_rules?: string`
- `config?: string`
- `filter?: string`
- `test_dir?: string`
- `snapshot_dir?: string`
- `update_snapshots?: boolean`
- `format?: "ast" | "cst" | "sexp" | "pattern"`

Validation rules:

- `search` requires `pattern` and `lang`.
- `replace` requires `pattern`, `rewrite`, and `lang`.
- `scan` requires exactly one of `rule_file` or `inline_rules`.
- `ruleTest` accepts `test_dir`, `snapshot_dir`, `config`, `filter`, and `update_snapshots`.
- `debugPattern` requires `pattern`, `lang`, and `format`.
- Unused fields should be tolerated when harmless, but missing required fields must produce clear errors.

## Migration Strategy

- Keep all current helper functions in `dot_config/opencode/plugins/ast-grep/index.ts`.
- Replace the five current tool registrations with one `ast_grep` registration.
- Dispatch by `operation` to the existing implementation bodies.
- Keep current tests but rewrite them to call `tools.ast_grep.execute({ operation: ... })`.
- Do not keep compatibility aliases unless a concrete need appears. The goal is token efficiency in the live tool list.
- Update user-facing error messages and checked-in documentation so they do not continue advertising removed `ast_grep_*` top-level tools.

## Tasks

### Task 1: Add Single Tool Skeleton

**Files:**

- Modify: `dot_config/opencode/plugins/ast-grep/index.ts`
- Modify: `dot_config/opencode/plugins/ast-grep/index.test.ts`

- [ ] **Step 1: Replace registration assertions**

Update tests so the plugin only asserts `hooks.tool?.ast_grep` exists and no longer expects five top-level tools.

- [ ] **Step 2: Add the `ast_grep` tool schema**

Register one tool named `ast_grep` with an `operation` enum and optional fields for all operations.

- [ ] **Step 3: Run the focused registration test**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/ast-grep/index.test.ts
```

Expected: tests fail only where old top-level tool names are still referenced.

### Task 2: Dispatch Existing Operations

**Files:**

- Modify: `dot_config/opencode/plugins/ast-grep/index.ts`
- Modify: `dot_config/opencode/plugins/ast-grep/index.test.ts`

- [ ] **Step 1: Extract operation handlers**

Move each current tool `execute` body into a named internal handler:

- `executeSearch`
- `executeReplace`
- `executeScan`
- `executeRuleTest`
- `executeDebugPattern`

- [ ] **Step 2: Dispatch by operation**

Implement:

```ts
execute: async (input, context) => {
  if (input.operation === "search") return executeSearch(input, context);
  if (input.operation === "replace") return executeReplace(input, context);
  if (input.operation === "scan") return executeScan(input, context);
  if (input.operation === "ruleTest") return executeRuleTest(input, context);
  if (input.operation === "debugPattern") return executeDebugPattern(input, context);
  throw new Error(`Unsupported ast_grep operation: ${input.operation}`);
}
```

- [ ] **Step 3: Update all tests to nested operations**

Replace calls like:

```ts
tools.ast_grep_search.execute({ pattern: "$A", lang: "ts" }, context())
```

With:

```ts
tools.ast_grep.execute({ operation: "search", pattern: "$A", lang: "ts" }, context())
```

### Task 3: Preserve Safety Behavior

**Files:**

- Modify: `dot_config/opencode/plugins/ast-grep/index.test.ts`

- [ ] **Step 1: Verify external path permission still works**

Keep coverage for outside-worktree path resolution through `external_directory` permission.

- [ ] **Step 2: Verify write permission still works**

Keep coverage for `replace`, `scan`, and `ruleTest` write paths using `context.ask({ type: "edit", paths })`.

- [ ] **Step 3: Verify debug-pattern still handles stderr output**

Keep the regression test that treats `stderr || stdout` as successful debug output.

- [ ] **Step 4: Update user-facing error messages**

Search implementation errors for removed tool names and update them to the nested operation style.

For example, replace the old scan-tool-specific error with:

```ts
throw new Error('ast_grep operation "scan" requires exactly one of rule_file or inline_rules.');
```

Run:

```bash
rg "ast_grep_(search|replace|scan|rule_test|debug_pattern)" dot_config/opencode/plugins/ast-grep
```

Expected: no implementation error strings or live tool registration names use removed top-level tool names.

### Task 4: Clean Up Stale Documentation

**Files:**

- Modify: `docs/superpowers/plans/2026-05-22-opencode-ast-grep-plugin.md`
- Modify: any other files found by search

- [ ] **Step 1: Search for stale top-level tool names**

Run:

```bash
rg "ast_grep_(search|replace|scan|rule_test|debug_pattern)" .
```

Expected: matches show only intentional historical context or examples being updated in this task.

- [ ] **Step 2: Update the original ast-grep plan**

Edit `docs/superpowers/plans/2026-05-22-opencode-ast-grep-plugin.md` so it says the original five-tool plan was superseded by `docs/superpowers/plans/2026-05-22-opencode-ast-grep-single-tool.md`, or update its tool section to describe the single `ast_grep` nested-operation interface.

- [ ] **Step 3: Verify no stale live-behavior docs remain**

Run:

```bash
rg "ast_grep_(search|replace|scan|rule_test|debug_pattern)" docs dot_config/opencode
```

Expected: no stale references remain outside historical migration examples in this plan.

### Task 5: Full Verification and Live Reload

**Files:**

- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/ast-grep/index.test.ts
```

Expected: all ast-grep tests pass.

- [ ] **Step 2: Run full OpenCode plugin checks**

Run:

```bash
npm run typecheck --workspace dot_config/opencode
npm run lint --workspace dot_config/opencode
npm run format:check --workspace dot_config/opencode
```

Expected: all checks pass.

- [ ] **Step 3: Apply and restart**

Run:

```bash
chezmoi apply
```

Restart OpenCode because local plugins are loaded at startup.

- [ ] **Step 4: Smoke test live tool list and operations**

Verify the live tool list exposes `ast_grep` instead of the five old `ast_grep_*` tools, then smoke test:

- `operation: "debugPattern"`
- `operation: "search"`
- `operation: "replace", apply: false`

## Self-Review

Spec coverage:

- The plan collapses the existing ast-grep plugin into one nested-operation tool.
- It preserves all current operations and safety gates.
- It explicitly removes compatibility aliases to improve token efficiency.

Placeholder scan:

- No task is left as TBD.

Type consistency:

- Public tool name is `ast_grep`.
- Operation names use concise camelCase where a previous operation name had multiple words.
