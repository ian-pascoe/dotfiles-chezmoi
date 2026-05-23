# OpenCode LSP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local OpenCode plugin that overrides the built-in `lsp` tool, preserves the existing read-only operations, and adds write-capable operations for diagnostics, code actions, rename, formatting, organize imports, and fix-all.

**Architecture:** The plugin runs its own LSP client processes from OpenCode's already-merged `lsp` config, keyed by worktree and server name. OpenCode's `lsp` config remains the single source of truth for server commands, extensions, environment, initialization options, disabled state, and any future supported LSP configuration options; the plugin must not introduce a separate LSP configuration surface. It uses maintained VS Code protocol libraries for JSON-RPC/LSP framing and types, then applies returned edits locally with OpenCode edit permission gates.

**Tech Stack:** TypeScript, OpenCode plugin API, `vscode-jsonrpc`, `vscode-languageserver-protocol`, Node child processes, Vitest.

---

## Scope

This plan intentionally does not try to expose every LSP request. The MVP preserves the current built-in `lsp` tool surface and extends it with high-value workflows that current built-in LSP tools do not cover because they require writes or diagnostic aggregation.

Tool to add:

- `lsp`

This plugin intentionally registers a tool named `lsp` to override the built-in read-only OpenCode LSP interface. It must recreate the existing read-only operations so no capability is lost, then add the write-capable operations in the same nested `operation` enum.

OpenCode tool override support is assumed and required for this plan. Do not add a distinct `lsp_edit` compatibility fallback unless implementation proves the configured OpenCode version no longer supports tool overrides.

Supported `operation` values:

- `goToDefinition`
- `findReferences`
- `hover`
- `documentSymbol`
- `workspaceSymbol`
- `goToImplementation`
- `prepareCallHierarchy`
- `incomingCalls`
- `outgoingCalls`
- `diagnostics`
- `codeActions`
- `applyCodeAction`
- `renameSymbol`
- `formatDocument`
- `organizeImports`
- `fixAll`

Known MVP limits:

- Command-only code actions are listed but not executed.
- LSP workspace resource operations are rejected initially: create file, rename file, delete file.
- Diagnostics are collected by opening requested files, not by full workspace pull diagnostics.
- Server lifecycle is session-scoped and in-memory.
- Current OpenCode config only has `biome`; semantic rename becomes much more valuable after adding servers such as TypeScript, Pyright, rust-analyzer, lua-language-server, or gopls.
- The read-only operations should keep the same argument names and output style as the built-in `lsp` tool as much as practical, so replacing it is low-risk for model behavior.
- The standalone client must consume OpenCode's existing merged `lsp` config as-is. It must support known fields such as `command`, `extensions`, `env`, initialization options, and disabled server entries, and preserve/pass through unknown future fields where practical instead of narrowing the config destructively.
- Documents must not be treated as immutable after the first `didOpen`; the client must update versions with `didChange` before every request when file content changed, including after plugin-applied edits.
- Returned workspace-edit URIs must be permission-checked before preview reads and before writes.

## File Structure

- Create `dot_config/opencode/plugins/lsp-tools.ts`
  - Auto-discovered plugin entrypoint.

- Create `dot_config/opencode/plugins/lsp-tools/index.ts`
  - Registers OpenCode tools and wires schemas to implementation helpers.
  - Captures merged OpenCode config from the plugin `config(cfg)` hook.

- Create `dot_config/opencode/plugins/lsp-tools/path.ts`
  - Resolves paths relative to `context.directory`.
  - Requests `external_directory` permission for paths outside `context.worktree`.
  - Requests edit permission before applying edits.

- Create `dot_config/opencode/plugins/lsp-tools/types.ts`
  - Defines narrow plugin-local types for OpenCode `lsp` config, tool results, diagnostics, and injected test doubles.

- Create `dot_config/opencode/plugins/lsp-tools/client.ts`
  - Starts LSP server processes using `vscode-jsonrpc`.
  - Initializes servers using `vscode-languageserver-protocol` request/notification types.
  - Opens documents, sends requests, tracks published diagnostics, and shuts down processes when the plugin process exits.

- Create `dot_config/opencode/plugins/lsp-tools/workspace-edit.ts`
  - Converts LSP `WorkspaceEdit` and text edit arrays into preview hunks.
  - Applies text edits from bottom to top by file.
  - Preserves line endings and rejects unsupported resource operations.

- Create `dot_config/opencode/plugins/lsp-tools/format.ts`
  - Formats diagnostics, code actions, edit previews, and apply results for model-friendly tool output.

- Create `dot_config/opencode/plugins/lsp-tools/index.test.ts`
  - Tests tool registration, schema-level behavior, permission flow, and tool orchestration with fake LSP clients.

- Create `dot_config/opencode/plugins/lsp-tools/path.test.ts`
  - Tests path resolution, outside-worktree permission, and edit permission handling.

- Create `dot_config/opencode/plugins/lsp-tools/workspace-edit.test.ts`
  - Tests edit conversion, preview formatting, application ordering, CRLF preservation, and unsupported operation rejection.

- Create `dot_config/opencode/plugins/lsp-tools/client.test.ts`
  - Tests server selection and request orchestration with injected connection/process doubles.

- Modify `dot_config/opencode/package.json`
  - Add runtime dependencies: `vscode-jsonrpc`, `vscode-languageserver-protocol`.

- Modify `package-lock.json`
  - Generated by `npm install --workspace dot_config/opencode vscode-jsonrpc vscode-languageserver-protocol`.

## Tool Contracts

### `lsp`

Common inputs:

- `operation: "goToDefinition" | "findReferences" | "hover" | "documentSymbol" | "workspaceSymbol" | "goToImplementation" | "prepareCallHierarchy" | "incomingCalls" | "outgoingCalls" | "diagnostics" | "codeActions" | "applyCodeAction" | "renameSymbol" | "formatDocument" | "organizeImports" | "fixAll"`
- `server?: string`
- `file?: string`
- `filePath?: string`
- `paths?: string[]`
- `query?: string`
- `start_line?: number`
- `start_character?: number`
- `end_line?: number`
- `end_character?: number`
- `kind?: string`
- `title?: string`
- `index?: number`
- `line?: number`
- `character?: number`
- `new_name?: string`
- `tab_size?: number`
- `insert_spaces?: boolean`
- `timeout_ms?: number`
- `apply?: boolean`

The implementation validates required fields per operation and returns a clear error for unused or missing fields.

For read-only compatibility operations, accept the built-in tool's existing shape:

- `filePath: string`
- `line: number`
- `character: number`
- `query?: string`

For the new write-capable operations, prefer `file` for single-file operations and `paths` for multi-file diagnostics. The implementation may also accept `filePath` as an alias for `file` to keep the merged tool ergonomic.

#### Operations: Built-In Read-Only Compatibility

Operations:

- `goToDefinition`
- `findReferences`
- `hover`
- `documentSymbol`
- `workspaceSymbol`
- `goToImplementation`
- `prepareCallHierarchy`
- `incomingCalls`
- `outgoingCalls`

Behavior:

- Match the built-in `lsp` tool inputs and output semantics.
- Use the same standalone LSP client manager as the write operations.
- Do not request edit permission.
- Keep these operations covered by tests before adding write operations so overriding the built-in tool does not regress existing workflows.

#### Operation: `diagnostics`

Inputs:

- `paths: string[]`
- `timeout_ms?: number`

Behavior:

- Resolve each path.
- Pick a configured LSP server by explicit `server` or file extension.
- Open each file with `textDocument/didOpen`.
- Wait up to `timeout_ms`, default `1000`, for `textDocument/publishDiagnostics`.
- Return normalized diagnostics with file, 1-based line and character, severity, source, code, and message.

No writes.

#### Operation: `codeActions`

Inputs:

- `file: string`
- `start_line?: number`
- `start_character?: number`
- `end_line?: number`
- `end_character?: number`
- `kind?: string`

Behavior:

- Open the file.
- Use the requested range or the whole document.
- Include known diagnostics for the selected file.
- Call `textDocument/codeAction`.
- Return indexed actions with title, kind, preferred flag, disabled reason, and whether an edit or command is present.

No writes.

#### Operation: `applyCodeAction`

Inputs:

- `file: string`
- `title?: string`
- `index?: number`
- `start_line?: number`
- `start_character?: number`
- `end_line?: number`
- `end_character?: number`
- `kind?: string`
- `apply: boolean`

Behavior:

- Recompute code actions for the current file contents.
- Select by `index` when provided.
- Select by exact `title` when provided.
- Reject ambiguous title matches.
- Reject command-only actions with a clear message.
- Resolve lazy code actions with `codeAction/resolve` when supported and needed.
- With `apply: false`, return an edit preview.
- With `apply: true`, ask edit permission for affected files, apply edits, and return changed files.

#### Operation: `renameSymbol`

Inputs:

- `file: string`
- `line: number`
- `character: number`
- `new_name: string`
- `apply: boolean`

Behavior:

- Open the file.
- Call `textDocument/prepareRename` when supported.
- Call `textDocument/rename`.
- Preview or apply returned `WorkspaceEdit`.
- Use 1-based tool positions and 0-based LSP positions internally.

#### Operation: `formatDocument`

Inputs:

- `file: string`
- `tab_size?: number`
- `insert_spaces?: boolean`
- `apply: boolean`

Behavior:

- Open the file.
- Call `textDocument/formatting`.
- Convert returned `TextEdit[]` into a `WorkspaceEdit` for the file.
- Preview or apply.

#### Operation: `organizeImports`

Inputs:

- `file: string`
- `title?: string`
- `index?: number`
- `apply: boolean`

Behavior:

- Wrapper around code action kind `source.organizeImports`.
- Prefer an `isPreferred` action when neither title nor index is supplied.
- Preview or apply.

#### Operation: `fixAll`

Inputs:

- `file: string`
- `kind?: string`
- `title?: string`
- `index?: number`
- `apply: boolean`

Behavior:

- Wrapper around code action kind `source.fixAll` by default.
- Allows source-specific kinds like `source.fixAll.biome`.
- Prefer an `isPreferred` action when neither title nor index is supplied.
- Preview or apply.

## Safety Model

- No silent writes.
- Every write-capable tool has an `apply` boolean.
- `apply: false` previews only.
- `apply: true` recomputes the current edit, requests OpenCode edit permission, applies, then reports changed files.
- Edit permission uses `context.ask({ type: "edit", paths })`.
- Non-throwing `context.ask` is treated as allowed, matching live OpenCode behavior.
- Explicit deny objects still fail closed.
- Outside-worktree paths use `context.ask({ permission: "external_directory", patterns: [path], always: [], metadata: { tool: "lsp-tools" } })`.
- LSP file URIs outside approved paths are rejected before preview and before apply.
- Unsupported workspace resource operations fail closed.
- Text edits are applied bottom-up by file.
- Tool output caps preview text to avoid huge transcript entries.

---

## Tasks

### Task 1: Add Dependencies

**Files:**

- Modify: `dot_config/opencode/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install maintained LSP protocol dependencies**

Run:

```bash
npm install --workspace dot_config/opencode vscode-jsonrpc vscode-languageserver-protocol
```

Expected:

```text
added ... packages
found 0 vulnerabilities
```

- [ ] **Step 2: Confirm package metadata changed only as expected**

Run:

```bash
git diff -- dot_config/opencode/package.json package-lock.json
```

Expected:

```text
dot_config/opencode/package.json includes vscode-jsonrpc and vscode-languageserver-protocol
package-lock.json includes the installed dependency graph
```

- [ ] **Step 3: Run baseline typecheck**

Run:

```bash
npm run typecheck --workspace dot_config/opencode
```

Expected:

```text
> typecheck
> tsgo --noEmit
```

### Task 2: Create Plugin Skeleton

**Files:**

- Create: `dot_config/opencode/plugins/lsp-tools.ts`
- Create: `dot_config/opencode/plugins/lsp-tools/index.ts`
- Create: `dot_config/opencode/plugins/lsp-tools/types.ts`
- Create: `dot_config/opencode/plugins/lsp-tools/index.test.ts`

- [ ] **Step 1: Add the auto-discovered entrypoint**

Create `dot_config/opencode/plugins/lsp-tools.ts`:

```ts
export { default as lspTools } from "./lsp-tools/index";
```

- [ ] **Step 2: Add narrow shared types**

Create `dot_config/opencode/plugins/lsp-tools/types.ts`:

```ts
import type { WorkspaceEdit } from "vscode-languageserver-protocol";

export type OpenCodeLspServerConfig = {
  command: string[];
  extensions?: string[];
  env?: Record<string, string>;
  initialization?: unknown;
  initializationOptions?: unknown;
  disabled?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
};

export type OpenCodeConfig = {
  lsp?: Record<string, OpenCodeLspServerConfig> | false;
};

export type DiagnosticItem = {
  file: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  severity: string;
  source: string;
  code: string;
  message: string;
};

export type CodeActionItem = {
  index: number;
  title: string;
  kind: string;
  preferred: boolean;
  disabled: string;
  hasEdit: boolean;
  hasCommand: boolean;
};

export type ApplyEditResult = {
  changedFiles: string[];
  preview: string;
};

export type ReadOnlyPositionInput = { file: string; line: number; character: number };

export type LspClient = {
  goToDefinition(input: ReadOnlyPositionInput): Promise<unknown>;
  findReferences(input: ReadOnlyPositionInput): Promise<unknown>;
  hover(input: ReadOnlyPositionInput): Promise<unknown>;
  documentSymbol(file: string): Promise<unknown>;
  workspaceSymbol(query: string): Promise<unknown>;
  goToImplementation(input: ReadOnlyPositionInput): Promise<unknown>;
  prepareCallHierarchy(input: ReadOnlyPositionInput): Promise<unknown>;
  incomingCalls(input: ReadOnlyPositionInput): Promise<unknown>;
  outgoingCalls(input: ReadOnlyPositionInput): Promise<unknown>;
  diagnostics(paths: string[], timeoutMs: number): Promise<DiagnosticItem[]>;
  codeActions(input: {
    file: string;
    range?: { startLine: number; startCharacter: number; endLine: number; endCharacter: number };
    kind?: string;
  }): Promise<CodeActionItem[]>;
  codeActionEdit(input: {
    file: string;
    title?: string;
    index?: number;
    range?: { startLine: number; startCharacter: number; endLine: number; endCharacter: number };
    kind?: string;
  }): Promise<WorkspaceEdit>;
  rename(input: {
    file: string;
    line: number;
    character: number;
    newName: string;
  }): Promise<WorkspaceEdit>;
  format(input: { file: string; tabSize: number; insertSpaces: boolean }): Promise<WorkspaceEdit>;
  didApplyEdit(paths: string[]): Promise<void>;
};
```

- [ ] **Step 3: Register placeholder tools**

Create `dot_config/opencode/plugins/lsp-tools/index.ts`:

```ts
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";

import type { OpenCodeConfig } from "./types";

const z = tool.schema;

function notImplemented(name: string): never {
  throw new Error(`${name} is not implemented yet.`);
}

export function createLspToolsPlugin(): Plugin {
  let config: OpenCodeConfig = {};

  return async () => ({
    config: (cfg) => {
      config = cfg as OpenCodeConfig;
      void config;
    },
    tool: {
      lsp: tool({
        description: "Run LSP operations including built-in read-only queries plus diagnostics, code actions, rename, format, organize imports, and fix-all.",
        args: {
          operation: z.union([
            z.literal("goToDefinition"),
            z.literal("findReferences"),
            z.literal("hover"),
            z.literal("documentSymbol"),
            z.literal("workspaceSymbol"),
            z.literal("goToImplementation"),
            z.literal("prepareCallHierarchy"),
            z.literal("incomingCalls"),
            z.literal("outgoingCalls"),
            z.literal("diagnostics"),
            z.literal("codeActions"),
            z.literal("applyCodeAction"),
            z.literal("renameSymbol"),
            z.literal("formatDocument"),
            z.literal("organizeImports"),
            z.literal("fixAll"),
          ]),
          paths: z.array(z.string().min(1)).optional(),
          file: z.string().min(1).optional(),
          filePath: z.string().min(1).optional(),
          query: z.string().optional(),
          server: z.string().min(1).optional(),
          start_line: z.number().int().positive().optional(),
          start_character: z.number().int().positive().optional(),
          end_line: z.number().int().positive().optional(),
          end_character: z.number().int().positive().optional(),
          kind: z.string().min(1).optional(),
          title: z.string().min(1).optional(),
          index: z.number().int().nonnegative().optional(),
          line: z.number().int().positive().optional(),
          character: z.number().int().positive().optional(),
          new_name: z.string().min(1).optional(),
          tab_size: z.number().int().positive().optional(),
          insert_spaces: z.boolean().optional(),
          timeout_ms: z.number().int().positive().optional(),
          apply: z.boolean().default(false),
        },
        execute: async () => notImplemented("lsp"),
      }),
    },
  });
}

export default createLspToolsPlugin();
```

- [ ] **Step 4: Add registration test**

Create `dot_config/opencode/plugins/lsp-tools/index.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import lspToolsPlugin from "./index";

describe("lsp-tools plugin", () => {
  test("exports the overriding LSP tool", async () => {
    const hooks = await lspToolsPlugin({
      client: {},
      project: { id: "project-1" },
      directory: process.cwd(),
      worktree: process.cwd(),
      experimental_workspace: { register() {} },
      serverUrl: new URL("http://localhost:4096"),
      $: {},
    } as never);

    assert.ok(hooks.tool?.lsp);
  });
});
```

- [ ] **Step 5: Run skeleton test**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools/index.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  1 passed
```

### Task 3: Add Path and Permission Helpers

**Files:**

- Create: `dot_config/opencode/plugins/lsp-tools/path.ts`
- Create: `dot_config/opencode/plugins/lsp-tools/path.test.ts`

- [ ] **Step 1: Implement path and permission helpers**

Create `dot_config/opencode/plugins/lsp-tools/path.ts`:

```ts
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ToolContext } from "@opencode-ai/plugin";

function isInsideWorktree(path: string, worktree: string): boolean {
  const rel = relative(worktree, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function askExternalDirectory(context: ToolContext, path: string): Promise<void> {
  const ask = context.ask as unknown as ((input: unknown) => Promise<unknown>) | undefined;
  if (typeof ask !== "function") {
    throw new Error(`External directory permission unavailable for LSP path: ${path}`);
  }

  let result: unknown;
  try {
    result = await ask({
      permission: "external_directory",
      patterns: [path],
      always: [],
      metadata: { tool: "lsp-tools" },
    });
  } catch (error) {
    throw new Error(`External directory permission denied for LSP path ${path}: ${(error as Error).message}`);
  }

  if (result && typeof result === "object" && "type" in result && (result as { type?: string }).type !== "allow") {
    throw new Error(`External directory permission denied for LSP path: ${path}`);
  }
}

export async function resolvePath(input: string, context: ToolContext): Promise<string> {
  const worktree = resolve(context.worktree);
  const directory = resolve(context.directory);
  const absolute = resolve(directory, input);
  if (!isInsideWorktree(absolute, worktree)) await askExternalDirectory(context, absolute);
  return absolute;
}

export async function askEdit(context: ToolContext, paths: string[]): Promise<void> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) throw new Error("Edit permission unavailable: no affected paths to approve.");

  const ask = context.ask as unknown as ((input: unknown) => Promise<unknown>) | undefined;
  if (typeof ask !== "function") throw new Error("Edit permission unavailable for LSP apply.");

  let result: unknown;
  try {
    result = await ask({ type: "edit", paths: uniquePaths });
  } catch (error) {
    throw new Error(`Edit permission denied for LSP apply: ${(error as Error).message}`);
  }

  if (result && typeof result === "object" && "type" in result && (result as { type?: string }).type !== "allow") {
    throw new Error("Edit permission denied for LSP apply.");
  }
}
```

- [ ] **Step 2: Test permission behavior**

Create `dot_config/opencode/plugins/lsp-tools/path.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";

import { askEdit, resolvePath } from "./path";

let root = "";
let calls: unknown[] = [];

function context(ask?: (input: unknown) => Promise<unknown>) {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "build",
    directory: root,
    worktree: root,
    abort: new AbortController().signal,
    metadata() {},
    ask:
      ask ??
      (async (input: unknown) => {
        calls.push(input);
      }),
  } as never;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-lsp-tools-path-test-"));
  calls = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("lsp-tools path helpers", () => {
  test("resolves paths inside the worktree without asking external permission", async () => {
    const resolved = await resolvePath("src/app.ts", context());

    assert.equal(resolved, join(root, "src/app.ts"));
    assert.equal(calls.length, 0);
  });

  test("asks external_directory for paths outside the worktree", async () => {
    const outside = join(root, "..", "outside.ts");

    await resolvePath(outside, context());

    assert.equal(calls.length, 1);
    assert.match(JSON.stringify(calls[0]), /external_directory/);
    assert.match(JSON.stringify(calls[0]), /lsp-tools/);
  });

  test("fails closed when external_directory is denied", async () => {
    await assert.rejects(
      () => resolvePath(join(root, "..", "outside.ts"), context(async () => ({ type: "deny" }))),
      /external directory permission denied/i,
    );
  });

  test("asks edit permission and treats non-throwing ask as allowed", async () => {
    await askEdit(context(), [join(root, "a.ts"), join(root, "a.ts")]);

    assert.equal(calls.length, 1);
    assert.match(JSON.stringify(calls[0]), /edit/);
  });

  test("fails closed when edit permission is denied", async () => {
    await assert.rejects(
      () => askEdit(context(async () => ({ type: "deny" })), [join(root, "a.ts")]),
      /edit permission denied/i,
    );
  });
});
```

- [ ] **Step 3: Run path tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools/path.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  5 passed
```

### Task 4: Add Workspace Edit Preview and Apply

**Files:**

- Create: `dot_config/opencode/plugins/lsp-tools/workspace-edit.ts`
- Create: `dot_config/opencode/plugins/lsp-tools/workspace-edit.test.ts`

- [ ] **Step 1: Implement workspace edit conversion and application**

Create `dot_config/opencode/plugins/lsp-tools/workspace-edit.ts` with these exported functions:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { TextEdit, WorkspaceEdit } from "vscode-languageserver-protocol";

type FileEdit = { path: string; edits: TextEdit[] };
type ApprovePath = (path: string) => Promise<void>;

const MAX_PREVIEW_CHARS = 12000;

export function pathToUri(path: string): string {
  return pathToFileURL(path).toString();
}

export function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) throw new Error(`Unsupported LSP URI: ${uri}`);
  return fileURLToPath(uri);
}

function offsetAt(text: string, line: number, character: number): number {
  let offset = 0;
  for (let currentLine = 0; currentLine < line; currentLine++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return Math.min(text.length, offset + character);
}

function lineEndingOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeNewText(newText: string, lineEnding: string): string {
  return lineEnding === "\n" ? newText.replace(/\r\n/g, "\n") : newText.replace(/(?<!\r)\n/g, "\r\n");
}

export function fileEditsFromWorkspaceEdit(edit: WorkspaceEdit): FileEdit[] {
  const grouped = new Map<string, TextEdit[]>();

  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    grouped.set(uriToPath(uri), [...(grouped.get(uriToPath(uri)) ?? []), ...edits]);
  }

  for (const change of edit.documentChanges ?? []) {
    if ("kind" in change) throw new Error(`Unsupported LSP resource operation: ${change.kind}`);
    const path = uriToPath(change.textDocument.uri);
    grouped.set(path, [...(grouped.get(path) ?? []), ...change.edits]);
  }

  return [...grouped.entries()].map(([path, edits]) => ({ path, edits }));
}

async function approveFileEdits(fileEdits: FileEdit[], approvePath: ApprovePath): Promise<void> {
  for (const fileEdit of fileEdits) await approvePath(fileEdit.path);
}

export async function previewWorkspaceEdit(
  edit: WorkspaceEdit,
  approvePath: ApprovePath,
): Promise<{ files: string[]; text: string }> {
  const fileEdits = fileEditsFromWorkspaceEdit(edit);
  if (fileEdits.length === 0) return { files: [], text: "No edits." };
  await approveFileEdits(fileEdits, approvePath);

  const chunks: string[] = [];
  for (const fileEdit of fileEdits) {
    const original = await readFile(fileEdit.path, "utf8");
    chunks.push(`file: ${fileEdit.path}`);
    for (const textEdit of fileEdit.edits) {
      const startLine = textEdit.range.start.line + 1;
      const startCharacter = textEdit.range.start.character + 1;
      const endLine = textEdit.range.end.line + 1;
      const endCharacter = textEdit.range.end.character + 1;
      const start = offsetAt(original, textEdit.range.start.line, textEdit.range.start.character);
      const end = offsetAt(original, textEdit.range.end.line, textEdit.range.end.character);
      chunks.push(`range: ${startLine}:${startCharacter}-${endLine}:${endCharacter}`);
      chunks.push(`before: ${JSON.stringify(original.slice(start, end))}`);
      chunks.push(`after: ${JSON.stringify(textEdit.newText)}`);
    }
  }

  const text = chunks.join("\n");
  return {
    files: fileEdits.map((fileEdit) => fileEdit.path),
    text: text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n...preview truncated...` : text,
  };
}

export async function applyWorkspaceEdit(edit: WorkspaceEdit, approvePath: ApprovePath): Promise<string[]> {
  const fileEdits = fileEditsFromWorkspaceEdit(edit);
  await approveFileEdits(fileEdits, approvePath);
  const changedFiles: string[] = [];

  for (const fileEdit of fileEdits) {
    const original = await readFile(fileEdit.path, "utf8");
    const lineEnding = lineEndingOf(original);
    const ordered = [...fileEdit.edits].sort((a, b) => {
      const aStart = offsetAt(original, a.range.start.line, a.range.start.character);
      const bStart = offsetAt(original, b.range.start.line, b.range.start.character);
      return bStart - aStart;
    });

    let next = original;
    for (const textEdit of ordered) {
      const start = offsetAt(next, textEdit.range.start.line, textEdit.range.start.character);
      const end = offsetAt(next, textEdit.range.end.line, textEdit.range.end.character);
      next = `${next.slice(0, start)}${normalizeNewText(textEdit.newText, lineEnding)}${next.slice(end)}`;
    }

    if (next !== original) {
      await writeFile(fileEdit.path, next);
      changedFiles.push(fileEdit.path);
    }
  }

  return changedFiles;
}
```

- [ ] **Step 2: Add workspace edit tests**

Create `dot_config/opencode/plugins/lsp-tools/workspace-edit.test.ts` with tests covering:

```ts
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";

import { applyWorkspaceEdit, pathToUri, previewWorkspaceEdit } from "./workspace-edit";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-lsp-tools-edit-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("workspace edits", () => {
  test("previews and applies changes edits", async () => {
    const file = join(root, "app.ts");
    await writeFile(file, "const oldName = 1;\nconsole.log(oldName);\n");

    const edit = {
      changes: {
        [pathToUri(file)]: [
          { range: { start: { line: 1, character: 12 }, end: { line: 1, character: 19 } }, newText: "newName" },
          { range: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } }, newText: "newName" },
        ],
      },
    };

    const preview = await previewWorkspaceEdit(edit, async () => {});
    assert.deepEqual(preview.files, [file]);
    assert.match(preview.text, /oldName/);

    assert.deepEqual(await applyWorkspaceEdit(edit, async () => {}), [file]);
    assert.equal(await readFile(file, "utf8"), "const newName = 1;\nconsole.log(newName);\n");
  });

  test("preserves CRLF line endings in inserted text", async () => {
    const file = join(root, "app.ts");
    await writeFile(file, "const value = 1;\r\n");

    await applyWorkspaceEdit(
      {
        changes: {
          [pathToUri(file)]: [
            { range: { start: { line: 0, character: 16 }, end: { line: 0, character: 16 } }, newText: "\nconst next = 2;" },
          ],
        },
      },
      async () => {},
    );

    assert.equal(await readFile(file, "utf8"), "const value = 1;\r\nconst next = 2;\r\n");
  });

  test("rejects resource operations", async () => {
    await assert.rejects(
      () => previewWorkspaceEdit({ documentChanges: [{ kind: "delete", uri: pathToUri(join(root, "app.ts")) }] } as never, async () => {}),
      /unsupported lsp resource operation/i,
    );
  });

  test("approves returned file paths before preview reads", async () => {
    const file = join(root, "app.ts");
    const calls: string[] = [];
    await writeFile(file, "const value = 1;\n");

    await previewWorkspaceEdit(
      { changes: { [pathToUri(file)]: [{ range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, newText: "next" }] } },
      async (path) => {
        calls.push(path);
      },
    );

    assert.deepEqual(calls, [file]);
  });

  test("fails closed before preview reads when approval rejects", async () => {
    const file = join(root, "secret.ts");

    await assert.rejects(
      () =>
        previewWorkspaceEdit(
          { changes: { [pathToUri(file)]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "leak" }] } },
          async () => {
            throw new Error("denied");
          },
        ),
      /denied/,
    );
  });
});
```

- [ ] **Step 3: Run workspace edit tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools/workspace-edit.test.ts
```

Expected:

```text
Test Files  1 passed
Tests  5 passed
```

### Task 5: Add LSP Client Manager

**Files:**

- Create: `dot_config/opencode/plugins/lsp-tools/client.ts`
- Create: `dot_config/opencode/plugins/lsp-tools/client.test.ts`

- [ ] **Step 1: Implement server selection and client abstraction**

Create `dot_config/opencode/plugins/lsp-tools/client.ts` with:

```ts
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
  CallHierarchyPrepareRequest,
  CodeActionRequest,
  CodeActionResolveRequest,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentFormattingRequest,
  DocumentSymbolRequest,
  HoverRequest,
  ImplementationRequest,
  InitializeRequest,
  InitializedNotification,
  PrepareRenameRequest,
  PublishDiagnosticsNotification,
  ReferencesRequest,
  RenameRequest,
  WorkspaceSymbolRequest,
} from "vscode-languageserver-protocol";
import type { CodeAction, Diagnostic, InitializeResult, WorkspaceEdit } from "vscode-languageserver-protocol";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";

import type { CodeActionItem, DiagnosticItem, LspClient, OpenCodeConfig, OpenCodeLspServerConfig } from "./types";
import { pathToUri } from "./workspace-edit";

type ManagedServer = {
  client: LspClient;
  stop(): Promise<void>;
};

function severityName(severity: number | undefined): string {
  if (severity === 1) return "error";
  if (severity === 2) return "warning";
  if (severity === 3) return "information";
  if (severity === 4) return "hint";
  return "unknown";
}

function diagnosticItem(file: string, diagnostic: Diagnostic): DiagnosticItem {
  return {
    file,
    line: diagnostic.range.start.line + 1,
    character: diagnostic.range.start.character + 1,
    endLine: diagnostic.range.end.line + 1,
    endCharacter: diagnostic.range.end.character + 1,
    severity: severityName(diagnostic.severity),
    source: diagnostic.source ?? "",
    code: diagnostic.code === undefined ? "" : String(diagnostic.code),
    message: diagnostic.message,
  };
}

function codeActionItem(action: CodeAction, index: number): CodeActionItem {
  return {
    index,
    title: action.title,
    kind: action.kind ?? "",
    preferred: action.isPreferred ?? false,
    disabled: action.disabled?.reason ?? "",
    hasEdit: Boolean(action.edit),
    hasCommand: Boolean(action.command),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ProtocolLspClient implements LspClient {
  private diagnosticsByUri = new Map<string, Diagnostic[]>();
  private documents = new Map<string, { version: number; text: string }>();
  private capabilities: InitializeResult["capabilities"] = {};

  constructor(
    private readonly connection: ReturnType<typeof createMessageConnection>,
    private readonly root: string,
    private readonly serverName: string,
    private readonly serverConfig: OpenCodeLspServerConfig,
  ) {
    this.connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
      this.diagnosticsByUri.set(params.uri, params.diagnostics);
    });
  }

  async initialize(): Promise<void> {
    const result = await this.connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: pathToUri(this.root),
      capabilities: {
        textDocument: {
          synchronization: { didSave: true },
          codeAction: { dynamicRegistration: false, codeActionLiteralSupport: { codeActionKind: { valueSet: [] } } },
          rename: { dynamicRegistration: false, prepareSupport: true },
          formatting: { dynamicRegistration: false },
        },
        workspace: { applyEdit: false, workspaceEdit: { documentChanges: true } },
      },
      initializationOptions: this.serverConfig.initializationOptions ?? this.serverConfig.initialization ?? {},
      workspaceFolders: [{ uri: pathToUri(this.root), name: this.serverName }],
    });
    this.capabilities = result.capabilities;
    this.connection.sendNotification(InitializedNotification.type, {});
  }

  async sync(file: string): Promise<void> {
    const uri = pathToUri(file);
    const text = await readFile(file, "utf8");
    const existing = this.documents.get(uri);
    if (!existing) {
      this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: extname(file).slice(1) || "plaintext", version: 1, text },
      });
      this.documents.set(uri, { version: 1, text });
      return;
    }
    if (existing.text === text) return;
    const version = existing.version + 1;
    this.connection.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
    this.documents.set(uri, { version, text });
  }

  async didApplyEdit(paths: string[]): Promise<void> {
    for (const path of paths) await this.sync(path);
  }

  async goToDefinition(input: Parameters<LspClient["goToDefinition"]>[0]): Promise<unknown> {
    await this.sync(input.file);
    return this.connection.sendRequest(DefinitionRequest.type, positionParams(input));
  }

  async findReferences(input: Parameters<LspClient["findReferences"]>[0]): Promise<unknown> {
    await this.sync(input.file);
    return this.connection.sendRequest(ReferencesRequest.type, {
      ...positionParams(input),
      context: { includeDeclaration: true },
    });
  }

  async hover(input: Parameters<LspClient["hover"]>[0]): Promise<unknown> {
    await this.sync(input.file);
    return this.connection.sendRequest(HoverRequest.type, positionParams(input));
  }

  async documentSymbol(file: string): Promise<unknown> {
    await this.sync(file);
    return this.connection.sendRequest(DocumentSymbolRequest.type, { textDocument: { uri: pathToUri(file) } });
  }

  async workspaceSymbol(query: string): Promise<unknown> {
    return this.connection.sendRequest(WorkspaceSymbolRequest.type, { query });
  }

  async goToImplementation(input: Parameters<LspClient["goToImplementation"]>[0]): Promise<unknown> {
    await this.sync(input.file);
    return this.connection.sendRequest(ImplementationRequest.type, positionParams(input));
  }

  async prepareCallHierarchy(input: Parameters<LspClient["prepareCallHierarchy"]>[0]): Promise<unknown> {
    await this.sync(input.file);
    return this.connection.sendRequest(CallHierarchyPrepareRequest.type, positionParams(input));
  }

  async incomingCalls(input: Parameters<LspClient["incomingCalls"]>[0]): Promise<unknown> {
    const items = (await this.prepareCallHierarchy(input)) as Array<unknown> | null;
    return Promise.all((items ?? []).map((item) => this.connection.sendRequest(CallHierarchyIncomingCallsRequest.type, { item })));
  }

  async outgoingCalls(input: Parameters<LspClient["outgoingCalls"]>[0]): Promise<unknown> {
    const items = (await this.prepareCallHierarchy(input)) as Array<unknown> | null;
    return Promise.all((items ?? []).map((item) => this.connection.sendRequest(CallHierarchyOutgoingCallsRequest.type, { item })));
  }

  async diagnostics(paths: string[], timeoutMs: number): Promise<DiagnosticItem[]> {
    for (const path of paths) await this.sync(path);
    await wait(timeoutMs);
    return paths.flatMap((path) => (this.diagnosticsByUri.get(pathToUri(path)) ?? []).map((diagnostic) => diagnosticItem(path, diagnostic)));
  }

  async codeActions(input: Parameters<LspClient["codeActions"]>[0]): Promise<CodeActionItem[]> {
    const actions = await this.rawCodeActions(input);
    return actions.map(codeActionItem);
  }

  async codeActionEdit(input: Parameters<LspClient["codeActionEdit"]>[0]): Promise<WorkspaceEdit> {
    const actions = await this.rawCodeActions(input);
    let selected = selectAction(actions, input.title, input.index);
    if (!selected.edit && this.capabilities.codeActionProvider && typeof this.capabilities.codeActionProvider === "object" && this.capabilities.codeActionProvider.resolveProvider) {
      selected = await this.connection.sendRequest(CodeActionResolveRequest.type, selected);
    }
    if (!selected.edit) throw new Error(`LSP code action has no edit: ${selected.title}`);
    return selected.edit;
  }

  async rename(input: Parameters<LspClient["rename"]>[0]): Promise<WorkspaceEdit> {
    await this.sync(input.file);
    try {
      await this.connection.sendRequest(PrepareRenameRequest.type, {
        textDocument: { uri: pathToUri(input.file) },
        position: { line: input.line - 1, character: input.character - 1 },
      });
    } catch (error) {
      if (!/method not found|not supported/i.test((error as Error).message)) throw error;
    }
    return await this.connection.sendRequest(RenameRequest.type, {
      textDocument: { uri: pathToUri(input.file) },
      position: { line: input.line - 1, character: input.character - 1 },
      newName: input.newName,
    });
  }

  async format(input: Parameters<LspClient["format"]>[0]): Promise<WorkspaceEdit> {
    await this.sync(input.file);
    const edits = await this.connection.sendRequest(DocumentFormattingRequest.type, {
      textDocument: { uri: pathToUri(input.file) },
      options: { tabSize: input.tabSize, insertSpaces: input.insertSpaces },
    });
    return { changes: { [pathToUri(input.file)]: edits ?? [] } };
  }

  private async rawCodeActions(input: Parameters<LspClient["codeActions"]>[0]): Promise<CodeAction[]> {
    await this.sync(input.file);
    const diagnostics = this.diagnosticsByUri.get(pathToUri(input.file)) ?? [];
    const range = input.range
      ? {
          start: { line: input.range.startLine - 1, character: input.range.startCharacter - 1 },
          end: { line: input.range.endLine - 1, character: input.range.endCharacter - 1 },
        }
      : { start: { line: 0, character: 0 }, end: { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER } };
    const actions = await this.connection.sendRequest(CodeActionRequest.type, {
      textDocument: { uri: pathToUri(input.file) },
      range,
      context: { diagnostics, only: input.kind ? [input.kind] : undefined },
    });
    return (actions ?? []).filter((action): action is CodeAction => "title" in action);
  }
}

function positionParams(input: { file: string; line: number; character: number }) {
  return {
    textDocument: { uri: pathToUri(input.file) },
    position: { line: input.line - 1, character: input.character - 1 },
  };
}

function selectAction(actions: CodeAction[], title: string | undefined, index: number | undefined): CodeAction {
  if (index !== undefined) {
    const action = actions[index];
    if (!action) throw new Error(`No LSP code action at index ${index}.`);
    return action;
  }
  if (title) {
    const matches = actions.filter((action) => action.title === title);
    if (matches.length === 0) throw new Error(`No LSP code action titled: ${title}`);
    if (matches.length > 1) throw new Error(`Multiple LSP code actions titled: ${title}`);
    return matches[0]!;
  }
  const preferred = actions.find((action) => action.isPreferred && action.edit);
  if (preferred) return preferred;
  const editable = actions.find((action) => action.edit);
  if (!editable) throw new Error("No editable LSP code action found.");
  return editable;
}

export class LspClientManager {
  private readonly servers = new Map<string, Promise<ManagedServer>>();

  constructor(
    private readonly config: () => OpenCodeConfig,
    private readonly worktree: string,
  ) {}

  async clientFor(file: string, serverName?: string): Promise<LspClient> {
    const selected = this.serverConfig(file, serverName);
    const key = `${this.worktree}:${selected.name}`;
    const managed = await (this.servers.get(key) ?? this.startServer(key, selected.name, selected.config));
    return managed.client;
  }

  private startServer(key: string, name: string, config: OpenCodeLspServerConfig): Promise<ManagedServer> {
    const promise = this.createServer(name, config);
    this.servers.set(key, promise);
    return promise;
  }

  private async createServer(name: string, config: OpenCodeLspServerConfig): Promise<ManagedServer> {
    const [command, ...args] = config.command;
    if (!command) throw new Error(`LSP server ${name} has an empty command.`);
    const child = spawn(command, args, {
      cwd: this.worktree,
      stdio: "pipe",
      env: { ...process.env, ...config.env },
    });
    const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
    connection.listen();
    const client = new ProtocolLspClient(connection, this.worktree, name, config);
    await client.initialize();
    return {
      client,
      stop: async () => {
        connection.dispose();
        child.kill();
      },
    };
  }

  private serverConfig(file: string, serverName?: string): { name: string; config: OpenCodeLspServerConfig } {
    const servers = this.config().lsp;
    if (!servers) throw new Error("No OpenCode LSP servers are configured.");
    if (serverName) {
      const config = servers[serverName];
      if (!config) throw new Error(`OpenCode LSP server is not configured: ${serverName}`);
      if (config.disabled || config.enabled === false)
        throw new Error(`OpenCode LSP server is disabled: ${serverName}`);
      return { name: serverName, config };
    }
    const extension = extname(file);
    for (const [name, config] of Object.entries(servers)) {
      if (config.disabled || config.enabled === false) continue;
      if (config.extensions?.includes(extension)) return { name, config };
    }
    throw new Error(`No OpenCode LSP server configured for extension: ${extension}`);
  }
}
```

- [ ] **Step 2: Add server selection tests**

Create `dot_config/opencode/plugins/lsp-tools/client.test.ts` with fake-manager-friendly tests for extension and explicit server selection. Also test the request-level behavior that does not require a real subprocess by injecting fake connections where practical:

- disabled servers are skipped for extension selection;
- explicit disabled server selection throws;
- configured `env` is passed to `spawn`;
- configured `initializationOptions` or `initialization` is sent during initialize;
- `sync` sends `didOpen` first, then `didChange` with incrementing versions when file text changes;
- `didApplyEdit` refreshes changed files through `sync`;
- code actions without an edit are resolved with `codeAction/resolve` when server capabilities advertise `resolveProvider`;
- code actions without an edit still fail clearly when resolve is unsupported or returns no edit.

- [ ] **Step 3: Run client tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools/client.test.ts
```

Expected:

```text
Test Files  1 passed
```

### Task 6: Add Formatting Helpers

**Files:**

- Create: `dot_config/opencode/plugins/lsp-tools/format.ts`
- Modify: `dot_config/opencode/plugins/lsp-tools/index.test.ts`

- [ ] **Step 1: Implement output formatting**

Create `dot_config/opencode/plugins/lsp-tools/format.ts`:

```ts
import type { CodeActionItem, DiagnosticItem } from "./types";

export function formatDiagnostics(items: DiagnosticItem[]): string {
  if (items.length === 0) return "No diagnostics.";
  return items
    .map((item) => `${item.file}:${item.line}:${item.character}-${item.endLine}:${item.endCharacter} ${item.severity} ${item.source} ${item.code}\n${item.message}`)
    .join("\n\n");
}

export function formatCodeActions(items: CodeActionItem[]): string {
  if (items.length === 0) return "No code actions.";
  return items
    .map((item) => [
      `index: ${item.index}`,
      `title: ${item.title}`,
      `kind: ${item.kind}`,
      `preferred: ${item.preferred}`,
      `disabled: ${item.disabled || "false"}`,
      `has_edit: ${item.hasEdit}`,
      `has_command: ${item.hasCommand}`,
    ].join("\n"))
    .join("\n\n");
}

export function formatApplyResult(changedFiles: string[]): string {
  return `Changed files: ${changedFiles.join(", ") || "none"}`;
}
```

- [ ] **Step 2: Add formatting tests in `index.test.ts` or a new `format.test.ts`**

Test exact output for:

- zero diagnostics;
- one diagnostic;
- zero code actions;
- one code action;
- apply result with no changed files;
- apply result with two changed files.

- [ ] **Step 3: Run formatting tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools
```

Expected:

```text
All current lsp-tools tests pass
```

### Task 7: Wire Built-In Read-Only Compatibility Operations

**Files:**

- Modify: `dot_config/opencode/plugins/lsp-tools/index.ts`
- Modify: `dot_config/opencode/plugins/lsp-tools/index.test.ts`

- [ ] **Step 1: Add dependency injection for tests**

Refactor `createLspToolsPlugin` to accept optional `clientFor` factory:

```ts
type ClientFor = (input: { file: string; server?: string; context: ToolContext }) => Promise<LspClient>;

export function createLspToolsPlugin(options: { clientFor?: ClientFor } = {}): Plugin {
  let config: OpenCodeConfig = {};
  const managerFor = new Map<string, LspClientManager>();

  async function clientFor(file: string, server: string | undefined, context: ToolContext): Promise<LspClient> {
    if (options.clientFor) return options.clientFor({ file, server, context });
    const key = context.worktree;
    const manager = managerFor.get(key) ?? new LspClientManager(() => config, context.worktree);
    managerFor.set(key, manager);
    return manager.clientFor(file, server);
  }

  // existing return object follows
}
```

- [ ] **Step 2: Implement built-in read-only operations first**

In `client.ts`, implement the built-in read-only operations with the matching LSP protocol requests before wiring the dispatch layer:

- `goToDefinition` -> `DefinitionRequest.type`
- `findReferences` -> `ReferencesRequest.type`
- `hover` -> `HoverRequest.type`
- `documentSymbol` -> `DocumentSymbolRequest.type`
- `workspaceSymbol` -> `WorkspaceSymbolRequest.type`
- `goToImplementation` -> `ImplementationRequest.type`
- `prepareCallHierarchy` -> `CallHierarchyPrepareRequest.type`
- `incomingCalls` -> prepare call hierarchy first, then `CallHierarchyIncomingCallsRequest.type` for each prepared item
- `outgoingCalls` -> prepare call hierarchy first, then `CallHierarchyOutgoingCallsRequest.type` for each prepared item

In `format.ts`, implement formatter helpers used by the dispatch layer:

- `formatLocations`
- `formatHover`
- `formatSymbols`
- `formatCallHierarchy`
- `formatCalls`

Prefer the built-in `lsp` output style when known; otherwise use stable plain text with file URI/path, 1-based ranges, symbol names, kinds, and container names.

In `index.ts`, dispatch these operations before adding the new operations:

```ts
if (input.operation === "goToDefinition") return formatLocations(await client.goToDefinition(readOnlyInput(input)));
if (input.operation === "findReferences") return formatLocations(await client.findReferences(readOnlyInput(input)));
if (input.operation === "hover") return formatHover(await client.hover(readOnlyInput(input)));
if (input.operation === "documentSymbol") return formatSymbols(await client.documentSymbol(requiredFilePath(input)));
if (input.operation === "workspaceSymbol") return formatSymbols(await client.workspaceSymbol(input.query ?? ""));
if (input.operation === "goToImplementation") return formatLocations(await client.goToImplementation(readOnlyInput(input)));
if (input.operation === "prepareCallHierarchy") return formatCallHierarchy(await client.prepareCallHierarchy(readOnlyInput(input)));
if (input.operation === "incomingCalls") return formatCalls(await client.incomingCalls(readOnlyInput(input)));
if (input.operation === "outgoingCalls") return formatCalls(await client.outgoingCalls(readOnlyInput(input)));
```

This step must happen before `npm test --workspace dot_config/opencode -- plugins/lsp-tools/client.test.ts` is expected to pass, because `ProtocolLspClient` should satisfy `LspClient` as soon as it declares `implements LspClient`.

Add helper validation:

```ts
function requiredFilePath(input: { filePath?: string; file?: string }): string {
  const file = input.filePath ?? input.file;
  if (!file) throw new Error(`lsp operation requires filePath.`);
  return file;
}

function readOnlyInput(input: { filePath?: string; file?: string; line?: number; character?: number }) {
  if (input.line === undefined || input.character === undefined)
    throw new Error(`lsp operation requires line and character.`);
  return { file: requiredFilePath(input), line: input.line, character: input.character };
}
```

- [ ] **Step 3: Test built-in compatibility operations**

In `index.test.ts`, use a fake client and assert every built-in read-only operation dispatches to the expected client method with the built-in field names:

- `filePath`
- `line`
- `character`
- `query` for `workspaceSymbol`

- [ ] **Step 4: Implement `diagnostics`**

In `index.ts`, add per-operation validation and dispatch. Start with `diagnostics`:

```ts
execute: async (input, context) => {
  if (input.operation !== "diagnostics") return notImplemented(`lsp.${input.operation}`);
  if (!input.paths?.length) throw new Error('lsp operation "diagnostics" requires paths.');
  const paths = await Promise.all(input.paths.map((path) => resolvePath(path, context)));
  const client = await clientFor(paths[0]!, input.server, context);
  return formatDiagnostics(await client.diagnostics(paths, input.timeout_ms ?? 1000));
}
```

- [ ] **Step 5: Implement `codeActions` dispatch branch**

In `index.ts`, resolve file and call the client:

```ts
if (input.operation === "codeActions") {
  if (!input.file) throw new Error('lsp operation "codeActions" requires file.');
  const file = await resolvePath(input.file, context);
  const client = await clientFor(file, input.server, context);
  return formatCodeActions(await client.codeActions({ file, range: rangeFromInput(input), kind: input.kind }));
}
```

Add helper:

```ts
function rangeFromInput(input: {
  start_line?: number;
  start_character?: number;
  end_line?: number;
  end_character?: number;
}) {
  const hasAny = [input.start_line, input.start_character, input.end_line, input.end_character].some((value) => value !== undefined);
  if (!hasAny) return undefined;
  if (!input.start_line || !input.start_character || !input.end_line || !input.end_character) {
    throw new Error("Range requires start_line, start_character, end_line, and end_character.");
  }
  return {
    startLine: input.start_line,
    startCharacter: input.start_character,
    endLine: input.end_line,
    endCharacter: input.end_character,
  };
}
```

- [ ] **Step 6: Add new read-only tool tests**

In `index.test.ts`, use `createLspToolsPlugin({ clientFor })` with a fake client. Assert:

- `lsp` with operation `diagnostics` resolves paths and formats diagnostics;
- `lsp` with operation `codeActions` passes the requested range and kind;
- partial range input rejects clearly.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools/index.test.ts
```

Expected:

```text
Test Files  1 passed
```

### Task 8: Wire Write-Capable Tools

**Files:**

- Modify: `dot_config/opencode/plugins/lsp-tools/index.ts`
- Modify: `dot_config/opencode/plugins/lsp-tools/index.test.ts`

- [ ] **Step 1: Add shared preview/apply helper**

In `index.ts`, add:

```ts
async function previewOrApply(edit: WorkspaceEdit, apply: boolean, context: ToolContext): Promise<string> {
  const approvePath = (path: string) => resolvePath(path, context).then(() => undefined);
  const preview = await previewWorkspaceEdit(edit, approvePath);
  if (!apply) return preview.text;
  await askEdit(context, preview.files);
  const changedFiles = await applyWorkspaceEdit(edit, approvePath);
  const client = await clientFor(changedFiles[0] ?? context.directory, undefined, context);
  await client.didApplyEdit(changedFiles);
  return formatApplyResult(changedFiles);
}
```

The key safety requirement is that `approvePath` runs before `previewWorkspaceEdit` reads any file from a returned LSP URI. This prevents an LSP server from causing preview-time reads outside the worktree without `external_directory` permission.

- [ ] **Step 2: Implement operation `applyCodeAction`**

Use client `codeActionEdit`, then `previewOrApply`. `codeActionEdit` must support `codeAction/resolve` for actions that are returned without an `edit` but are resolvable. Gate resolve support on server capabilities when available, and test an action that gains its edit only after resolve.

- [ ] **Step 3: Implement operation `renameSymbol`**

Use client `rename`, then `previewOrApply`.

- [ ] **Step 4: Implement operation `formatDocument`**

Use client `format` with defaults `tab_size: 2` and `insert_spaces: true`, then `previewOrApply`.

- [ ] **Step 5: Implement operation `organizeImports`**

Use client `codeActionEdit` with `kind: "source.organizeImports"`, then `previewOrApply`.

- [ ] **Step 6: Implement operation `fixAll`**

Use client `codeActionEdit` with `kind: input.kind ?? "source.fixAll"`, then `previewOrApply`.

- [ ] **Step 7: Add write tool tests**

In `index.test.ts`, add fake client tests for:

- `apply: false` returns preview and does not ask edit permission;
- `apply: true` asks edit permission and writes file changes;
- denied edit permission rejects;
- returned edit URIs outside the worktree request `external_directory` before preview reads;
- denied `external_directory` for a returned edit URI fails before preview reads;
- returned edit URIs outside the worktree request `external_directory` before apply writes;
- organize imports sends `source.organizeImports`;
- fix all defaults to `source.fixAll`;
- fix all forwards custom `kind`.

- [ ] **Step 8: Run tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools
```

Expected:

```text
All lsp-tools tests pass
```

### Task 9: Run Full Verification

**Files:**

- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test --workspace dot_config/opencode -- plugins/lsp-tools
```

Expected:

```text
All lsp-tools tests pass
```

- [ ] **Step 2: Run workspace tests**

Run:

```bash
npm test --workspace dot_config/opencode
```

Expected:

```text
All OpenCode plugin tests pass
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck --workspace dot_config/opencode
```

Expected:

```text
> typecheck
> tsgo --noEmit
```

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint --workspace dot_config/opencode
```

Expected:

```text
> lint
> oxlint
```

- [ ] **Step 5: Run format check**

Run:

```bash
npm run format:check --workspace dot_config/opencode
```

Expected:

```text
All matched files use the correct format.
```

### Task 10: Apply and Smoke Test Live OpenCode

**Files:**

- No source edits unless smoke testing reveals a bug.

- [ ] **Step 1: Apply chezmoi changes**

Run:

```bash
chezmoi apply
```

Expected:

```text
No error output
```

- [ ] **Step 2: Restart OpenCode**

OpenCode loads plugins at startup. Quit and restart OpenCode after applying.

- [ ] **Step 3: Smoke test diagnostics**

Run the live `lsp` tool with `operation: "hover"` against a known symbol in a configured source file.

Expected:

```text
Hover output includes server-provided symbol/type documentation, or a clear no-hover result.
```

- [ ] **Step 4: Smoke test document symbols**

Run the live `lsp` tool with `operation: "documentSymbol"` against a configured source file.

Expected:

```text
Document symbols are returned with names, kinds, and ranges, or a clear no-symbols result.
```

- [ ] **Step 5: Smoke test workspace symbols**

Run the live `lsp` tool with `operation: "workspaceSymbol"` and a query that should match at least one symbol in the workspace.

Expected:

```text
Workspace symbols are returned, or a clear no-symbols result from the server.
```

- [ ] **Step 6: Smoke test one location operation**

Run the live `lsp` tool with `operation: "goToDefinition"` against a symbol in a configured source file.

Expected:

```text
Definition locations are returned with file/range output, or a clear no-definition result.
```

- [ ] **Step 7: Smoke test diagnostics**

Run the live `lsp` tool with `operation: "diagnostics"` against a TypeScript, JSON, or JSONC file covered by the configured `biome` server.

Expected:

```text
Either "No diagnostics." or normalized diagnostic entries with file:line:character ranges.
```

- [ ] **Step 8: Smoke test formatting preview**

Run the live `lsp` tool with `operation: "formatDocument"` and `apply: false` against a disposable file.

Expected:

```text
Preview output with affected file and ranges, or "No edits." for already formatted input.
```

- [ ] **Step 9: Smoke test fix-all preview**

Run the live `lsp` tool with `operation: "fixAll"` and `apply: false` against a disposable file with a known Biome-fixable issue.

Expected:

```text
Preview output with affected file and ranges.
```

- [ ] **Step 10: Smoke test permission-gated apply**

Run `lsp` with `operation: "fixAll"` or `operation: "formatDocument"` and `apply: true` against the disposable file.

Expected:

```text
OpenCode asks edit permission, applies the edit after allow, and reports changed files.
```

## Self-Review

Spec coverage:

- Diagnostics are covered by Tasks 5, 7, and 10.
- Code action listing and application are covered by Tasks 5, 7, 8, and 10.
- Rename is covered by Tasks 5 and 8.
- Formatting is covered by Tasks 5, 8, and 10.
- Organize imports and fix-all are covered by Task 8.
- Permission-gated writes are covered by Tasks 3, 4, and 8.
- Dependency-based protocol implementation is covered by Task 1 and Task 5.

Placeholder scan:

- No task is left as TBD.
- The only intentionally flexible area is `client.test.ts`, where the plan explicitly scopes tests to fakeable server selection and request behavior to avoid requiring a real LSP subprocess in unit tests.

Type consistency:

- Tool inputs use snake_case to match existing OpenCode plugin style.
- Internal TypeScript helper types use camelCase.
- Tool positions are 1-based externally and converted to 0-based internally.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-opencode-lsp-tools.md`.

Recommended execution mode: subagent-driven development, one fresh subagent per task, with review after each completed task.
