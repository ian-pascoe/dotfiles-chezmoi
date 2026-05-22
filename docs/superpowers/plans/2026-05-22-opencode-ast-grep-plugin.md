# OpenCode ast-grep Plugin Plan

## Objective

Build an auto-discovered OpenCode plugin that exposes `ast-grep` as a powerful structural coding assistant. The plugin should complement LSP tools by supporting syntax-aware discovery, previewable codemods, permission-gated writes, rule scans, rule tests, and pattern debugging.

## Design

Create a local plugin entrypoint at `dot_config/opencode/plugins/ast-grep.ts` that exports the implementation from `dot_config/opencode/plugins/ast-grep/index.ts`.

Use the installed `ast-grep` CLI instead of adding `@ast-grep/napi` so the plugin can use ast-grep's broader language support and native rewrite behavior. Resolve the binary from `AST_GREP_BIN` first, then `ast-grep` on `PATH`, and report a clear runtime error when unavailable.

## Tools

### `ast_grep_search`

Run structural search across files or directories.

Inputs include:

- `pattern`
- `lang`
- `paths`
- optional `globs`
- optional `strictness`
- optional `max_results`
- optional `context`

Return capped matches with file path, 1-based range, language, snippet, matched text, and truncation metadata.

### `ast_grep_replace`

Preview or apply structural replacements.

Inputs include:

- `pattern`
- `rewrite`
- `lang`
- `paths`
- optional `globs`
- optional `strictness`
- optional `max_results`
- `apply`

When `apply` is false, run a JSON rewrite preview only.

When `apply` is true:

- run a preview first;
- request OpenCode edit permission via `context.ask` for affected files;
- apply using `ast-grep run --rewrite --update-all`;
- rerun search afterward;
- return changed files and remaining-match verification.

### `ast_grep_scan`

Run rule-config or inline YAML scans.

Inputs include:

- `paths`
- either `rule_file` or `inline_rules`
- optional `config`
- optional `filter`
- optional `globs`
- optional `max_results`
- `apply`

When `apply` is true, request OpenCode edit permission and run `ast-grep scan --update-all`.

### `ast_grep_rule_test`

Run `ast-grep test` for reusable rule development.

Inputs include:

- optional `test_dir`
- optional `snapshot_dir`
- optional `config`
- optional `filter`
- optional `update_snapshots`

When updating snapshots, request OpenCode edit permission for the relevant test or snapshot directories.

### `ast_grep_debug_pattern`

Run `ast-grep run --debug-query=<format>` to inspect query parsing.

Inputs include:

- `pattern`
- `lang`
- `format`: `ast`, `cst`, `sexp`, or `pattern`

## Safety Model

- No silent writes.
- All write tools support preview mode.
- Resolve all relative paths from `context.directory`.
- Reject paths outside `context.worktree`.
- Avoid shell interpolation by using `node:child_process` argument arrays.
- Cap result count and snippet length to keep output model-friendly.
- Convert ast-grep 0-based ranges to 1-based editor coordinates.
- For `apply: true`, preview first, request edit permission, apply, then verify.

## Implementation Tasks

1. Add the plugin entrypoint and implementation directory.
2. Add command-building helpers for `run`, `scan`, `test`, and `debug-query` invocations.
3. Add path/worktree validation helpers.
4. Add JSON output parsing and result formatting helpers.
5. Register the five OpenCode tools.
6. Add Vitest coverage for registration, command args, preview parsing, path rejection, write permission flow, apply verification, scan, rule test, and debug pattern behavior.

## Verification

Run:

```sh
npm test --workspace dot_config/opencode
npm run typecheck --workspace dot_config/opencode
npm run lint --workspace dot_config/opencode
npm run format:check --workspace dot_config/opencode
```

OpenCode loads plugins at startup, so after applying this chezmoi source change the running OpenCode process must be restarted.
