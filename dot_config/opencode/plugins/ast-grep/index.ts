import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { tool } from "@opencode-ai/plugin";
import type { Plugin, ToolContext } from "@opencode-ai/plugin";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_RESULTS = 100;
const MAX_TEXT_LENGTH = 2000;

type RunnerResult = { stdout: string; stderr: string; exitCode: number };
type Runner = (
  bin: string,
  args: string[],
  options?: { cwd?: string; signal?: AbortSignal },
) => Promise<RunnerResult>;
type Match = {
  file: string;
  language?: string;
  text: string;
  snippet?: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  truncatedText: boolean;
};
type ParseOptions = { maxResults?: number | undefined; maxTextLength?: number | undefined };
type FormatOptions = { contextLines?: number | undefined };
type RunInput = {
  pattern: string;
  lang: string;
  strictness?: string | undefined;
  globs?: string[] | undefined;
};
type AstGrepInput = {
  operation: "search" | "replace" | "scan" | "ruleTest" | "debugPattern";
  pattern?: string | undefined;
  rewrite?: string | undefined;
  lang?: string | undefined;
  paths?: string[] | undefined;
  globs?: string[] | undefined;
  strictness?: string | undefined;
  max_results?: number | undefined;
  context?: number | undefined;
  apply?: boolean | undefined;
  rule_file?: string | undefined;
  inline_rules?: string | undefined;
  config?: string | undefined;
  filter?: string | undefined;
  test_dir?: string | undefined;
  snapshot_dir?: string | undefined;
  update_snapshots?: boolean | undefined;
  format?: "ast" | "cst" | "sexp" | "pattern" | undefined;
};

function astGrepBin(): string {
  return process.env.AST_GREP_BIN || "ast-grep";
}

async function defaultRunner(
  bin: string,
  args: string[],
  options?: { cwd?: string; signal?: AbortSignal },
) {
  try {
    const result = await execFileAsync(bin, args, {
      cwd: options?.cwd,
      signal: options?.signal,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };
    if (err.code === "ENOENT") throw new Error(`ast-grep binary not found: ${bin}`);
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
      exitCode: typeof err.code === "number" ? err.code : 1,
    };
  }
}

function isInsideWorktree(path: string, worktree: string): boolean {
  const rel = relative(worktree, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function askExternalDirectory(context: ToolContext, path: string) {
  const ask = context.ask as unknown as ((input: unknown) => Promise<unknown>) | undefined;
  if (typeof ask !== "function") {
    throw new Error(`External directory permission unavailable for ast-grep path: ${path}`);
  }
  let result: unknown;
  try {
    result = await ask({
      permission: "external_directory",
      patterns: [path],
      always: [],
      metadata: { tool: "ast-grep" },
    });
  } catch (error) {
    throw new Error(
      `External directory permission denied for ast-grep path ${path}: ${(error as Error).message}`,
    );
  }
  if (
    result &&
    typeof result === "object" &&
    "type" in result &&
    (result as { type?: string }).type !== "allow"
  ) {
    throw new Error(`External directory permission denied for ast-grep path: ${path}`);
  }
}

async function resolvePath(input: string, context: ToolContext): Promise<string> {
  const worktree = resolve(context.worktree);
  const directory = resolve(context.directory);
  const absolute = resolve(directory, input);
  if (!isInsideWorktree(absolute, worktree)) {
    await askExternalDirectory(context, absolute);
    return absolute;
  }
  return relative(directory, absolute) || ".";
}

function resolvePaths(paths: string[] | undefined, context: ToolContext): Promise<string[]> {
  return Promise.all((paths?.length ? paths : ["."]).map((path) => resolvePath(path, context)));
}

function addCommonRunArgs(args: string[], input: RunInput) {
  args.push("run", "--pattern", input.pattern, "--lang", input.lang);
  if (input.strictness) args.push("--strictness", input.strictness);
  for (const glob of input.globs ?? []) args.push("--globs", glob);
}

function buildRunArgs(input: RunInput, paths: string[], json: boolean) {
  const args: string[] = [];
  addCommonRunArgs(args, input);
  if (json) args.splice(5, 0, "--json");
  args.push(...paths);
  return args;
}

function buildReplaceArgs(
  input: RunInput & { rewrite: string },
  paths: string[],
  options: { json?: boolean; updateAll?: boolean } = {},
) {
  const args: string[] = [];
  addCommonRunArgs(args, input);
  if (options.json) args.splice(5, 0, "--json");
  args.push("--rewrite", input.rewrite);
  if (options.updateAll) args.push("--update-all");
  args.push(...paths);
  return args;
}

function normalizeMatches(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const value = raw as { matches?: unknown; diagnostics?: unknown };
    if (Array.isArray(value.matches)) return value.matches;
    if (Array.isArray(value.diagnostics)) return value.diagnostics;
  }
  return [];
}

function rangeOf(item: Record<string, unknown>) {
  const range = item.range as
    | { start?: { line?: number; column?: number }; end?: { line?: number; column?: number } }
    | undefined;
  return {
    start: {
      line: (range?.start?.line ?? 0) + 1,
      column: (range?.start?.column ?? 0) + 1,
    },
    end: {
      line: (range?.end?.line ?? range?.start?.line ?? 0) + 1,
      column: (range?.end?.column ?? range?.start?.column ?? 0) + 1,
    },
  };
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}

function matchLineIndex(lines: string[], match: Match): number {
  const firstTextLine = match.text.split("\n")[0] ?? "";
  const columnIndex = Math.max(0, match.start.column - 1);
  if (firstTextLine) {
    const columnMatch = lines.findIndex((line) =>
      line.slice(columnIndex).startsWith(firstTextLine),
    );
    if (columnMatch >= 0) return columnMatch;

    const substringMatch = lines.findIndex((line) => line.includes(firstTextLine));
    if (substringMatch >= 0) return substringMatch;
  }

  return 0;
}

export function parseJsonMatches(stdout: string, options: ParseOptions = {}) {
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxTextLength = options.maxTextLength ?? MAX_TEXT_LENGTH;
  let parsed: unknown;
  try {
    parsed = stdout.trim() ? JSON.parse(stdout) : [];
  } catch (error) {
    throw new Error(`Invalid ast-grep JSON output: ${(error as Error).message}`);
  }
  const raw = normalizeMatches(parsed);
  const matches: Match[] = raw.slice(0, maxResults).map((entry) => {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const text = String(item.text ?? item.lines ?? item.message ?? "");
    const truncatedText = text.length > maxTextLength;
    const range = rangeOf(item);
    const match: Match = {
      file: String(item.file ?? item.path ?? "<unknown>"),
      text: truncatedText ? text.slice(0, maxTextLength) : text,
      start: range.start,
      end: range.end,
      truncatedText,
    };
    if (typeof item.language === "string") match.language = item.language;
    if (typeof item.lines === "string") match.snippet = item.lines.slice(0, maxTextLength);
    return match;
  });
  return { matches, truncated: raw.length > matches.length, total: raw.length };
}

function contextSnippet(match: Match, contextLines: number | undefined): string | undefined {
  if (!match.snippet) return undefined;
  const lines = match.snippet.split("\n");
  const matchLines = lineCount(match.text);
  const before = matchLineIndex(lines, match);
  const availableContext = contextLines ?? Math.max(lines.length, matchLines);
  const start = Math.max(0, before - availableContext);
  const end = Math.min(lines.length, before + matchLines + availableContext);
  return lines.slice(start, end).join("\n");
}

function formatMatches(
  parsed: ReturnType<typeof parseJsonMatches>,
  options: FormatOptions = {},
): string {
  const metadata = `results_truncated: ${parsed.truncated}\ntotal_matches: ${parsed.total}`;
  if (parsed.matches.length === 0) return `No matches.\n${metadata}`;
  const lines = parsed.matches.map((match) => {
    const language = match.language ? ` (${match.language})` : "";
    const snippet = contextSnippet(match, options.contextLines);
    const parts = [
      `${match.file}:${match.start.line}:${match.start.column}-${match.end.line}:${match.end.column}${language}`,
      `text: ${match.text}`,
      `snippet: ${snippet ?? ""}`,
      `truncated: ${match.truncatedText}`,
    ];
    return parts.join("\n");
  });
  if (parsed.truncated)
    lines.push(`Results truncated to ${parsed.matches.length} of ${parsed.total}.`);
  lines.push(metadata);
  return lines.join("\n\n");
}

async function runAstGrep(
  runner: Runner,
  args: string[],
  context: ToolContext,
): Promise<RunnerResult> {
  try {
    const result = await runner(astGrepBin(), args, {
      cwd: context.directory,
      signal: context.abort,
    });
    if (result.exitCode !== 0)
      throw new Error(result.stderr || `ast-grep exited with code ${result.exitCode}`);
    return result;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT" || /ENOENT/.test(err.message)) {
      throw new Error(`ast-grep binary not found: ${astGrepBin()}`);
    }
    throw error;
  }
}

function affectedFiles(parsed: ReturnType<typeof parseJsonMatches>) {
  return [...new Set(parsed.matches.map((match) => match.file))];
}

function validateScanRuleSource(input: {
  rule_file?: string | undefined;
  inline_rules?: string | undefined;
}) {
  if (Boolean(input.rule_file) === Boolean(input.inline_rules)) {
    throw new Error('ast_grep operation "scan" requires exactly one of rule_file or inline_rules.');
  }
}

async function buildScanArgs(
  input: {
    rule_file?: string | undefined;
    inline_rules?: string | undefined;
    config?: string | undefined;
    filter?: string | undefined;
    globs?: string[] | undefined;
  },
  paths: string[],
  context: ToolContext,
  options: { json?: boolean; updateAll?: boolean } = {},
) {
  const args = ["scan"];
  if (options.json) args.push("--json");
  if (input.rule_file) args.push("--rule", await resolvePath(input.rule_file, context));
  if (input.inline_rules) args.push("--inline-rules", input.inline_rules);
  if (input.config) args.push("--config", await resolvePath(input.config, context));
  if (input.filter) args.push("--filter", input.filter);
  for (const glob of input.globs ?? []) args.push("--globs", glob);
  if (options.updateAll) args.push("--update-all");
  args.push(...paths);
  return args;
}

async function askEdit(context: ToolContext, paths: string[]) {
  if (paths.length === 0)
    throw new Error("Edit permission unavailable: no affected paths to approve.");
  const ask = context.ask as unknown as ((input: unknown) => Promise<unknown>) | undefined;
  if (typeof ask !== "function") throw new Error("Edit permission unavailable for ast-grep apply.");
  let result: unknown;
  try {
    result = await ask({
      permission: "edit",
      patterns: paths,
      always: [],
      metadata: { tool: "ast-grep" },
    });
  } catch (error) {
    throw new Error(`Edit permission denied for ast-grep apply: ${(error as Error).message}`);
  }
  if (
    result &&
    typeof result === "object" &&
    "type" in result &&
    (result as { type?: string }).type !== "allow"
  ) {
    throw new Error("Edit permission denied for ast-grep apply.");
  }
}

const z = tool.schema;
const stringArray = z.array(z.string().min(1)).optional();

function requireString(
  input: AstGrepInput,
  operation: AstGrepInput["operation"],
  field: keyof AstGrepInput,
): string {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`ast_grep operation "${operation}" requires ${String(field)}.`);
  }
  return value;
}

async function executeSearch(input: AstGrepInput, context: ToolContext, runner: Runner) {
  const runInput = {
    pattern: requireString(input, "search", "pattern"),
    lang: requireString(input, "search", "lang"),
    strictness: input.strictness,
    globs: input.globs,
  };
  const args = buildRunArgs(runInput, await resolvePaths(input.paths, context), true);
  const result = await runAstGrep(runner, args, context);
  return formatMatches(parseJsonMatches(result.stdout, { maxResults: input.max_results }), {
    contextLines: input.context,
  });
}

async function executeReplace(input: AstGrepInput, context: ToolContext, runner: Runner) {
  const replaceInput = {
    pattern: requireString(input, "replace", "pattern"),
    rewrite: requireString(input, "replace", "rewrite"),
    lang: requireString(input, "replace", "lang"),
    strictness: input.strictness,
    globs: input.globs,
  };
  const paths = await resolvePaths(input.paths, context);
  const previewArgs = buildReplaceArgs(replaceInput, paths, { json: true });
  const previewOutput = (await runAstGrep(runner, previewArgs, context)).stdout;
  const uncappedPreview = parseJsonMatches(previewOutput, {
    maxResults: Number.MAX_SAFE_INTEGER,
  });
  const preview = parseJsonMatches(previewOutput, { maxResults: input.max_results });
  if (!input.apply) return formatMatches(preview);

  const files = affectedFiles(uncappedPreview);
  if (files.length === 0) return "Changed files: none\nRemaining matches: 0";
  await askEdit(context, files);
  const applyArgs = buildReplaceArgs(replaceInput, files, { updateAll: true });
  await runAstGrep(runner, applyArgs, context);
  const verifyArgs = buildRunArgs(replaceInput, paths, true);
  const remaining = parseJsonMatches((await runAstGrep(runner, verifyArgs, context)).stdout, {
    maxResults: input.max_results,
  });
  return `Changed files: ${files.join(", ") || "none"}\nRemaining matches: ${remaining.total}`;
}

async function executeScan(input: AstGrepInput, context: ToolContext, runner: Runner) {
  validateScanRuleSource(input);
  const paths = await resolvePaths(input.paths, context);
  const args = await buildScanArgs(input, paths, context, { json: true });
  const previewOutput = (await runAstGrep(runner, args, context)).stdout;
  const uncappedPreview = parseJsonMatches(previewOutput, {
    maxResults: Number.MAX_SAFE_INTEGER,
  });
  const preview = parseJsonMatches(previewOutput, { maxResults: input.max_results });
  if (!input.apply) return formatMatches(preview);

  const files = affectedFiles(uncappedPreview);
  if (files.length === 0) return "Changed files: none\nRemaining matches: 0";
  await askEdit(context, files);
  await runAstGrep(
    runner,
    await buildScanArgs(input, files, context, { updateAll: true }),
    context,
  );
  const remaining = parseJsonMatches((await runAstGrep(runner, args, context)).stdout, {
    maxResults: input.max_results,
  });
  return `Changed files: ${files.join(", ") || "none"}\nRemaining matches: ${remaining.total}`;
}

async function executeRuleTest(input: AstGrepInput, context: ToolContext, runner: Runner) {
  const args = ["test"];
  const permissionPaths: string[] = [];
  if (input.test_dir) {
    const testDir = await resolvePath(input.test_dir, context);
    args.push("--test-dir", testDir);
    permissionPaths.push(testDir);
  }
  if (input.snapshot_dir) {
    const snapshotDir = await resolvePath(input.snapshot_dir, context);
    args.push("--snapshot-dir", snapshotDir);
    permissionPaths.push(snapshotDir);
  }
  if (input.config) args.push("--config", await resolvePath(input.config, context));
  if (input.filter) args.push("--filter", input.filter);
  if (input.update_snapshots) {
    await askEdit(context, permissionPaths.length ? permissionPaths : ["."]);
    args.push("--update-all");
  }
  const result = await runAstGrep(runner, args, context);
  return result.stdout || result.stderr || "ast-grep tests passed.";
}

async function executeDebugPattern(input: AstGrepInput, context: ToolContext, runner: Runner) {
  const pattern = requireString(input, "debugPattern", "pattern");
  const lang = requireString(input, "debugPattern", "lang");
  const format = requireString(input, "debugPattern", "format");
  const result = await runner(
    astGrepBin(),
    ["run", "--pattern", pattern, "--lang", lang, `--debug-query=${format}`, "/dev/null"],
    { cwd: context.directory, signal: context.abort },
  );
  const debugOutput = result.stderr || result.stdout;
  if (!debugOutput && result.exitCode !== 0)
    throw new Error(`ast-grep exited with code ${result.exitCode}`);
  return `ast-grep debug-query output:\n${debugOutput}`;
}

export function createAstGrepPlugin(options: { runner?: Runner } = {}): Plugin {
  const runner = options.runner ?? defaultRunner;
  return async () => ({
    tool: {
      ast_grep: tool({
        description:
          "Run ast-grep structural search, replacement, scan, rule-test, or debug-pattern operations.",
        args: {
          operation: z.union([
            z.literal("search"),
            z.literal("replace"),
            z.literal("scan"),
            z.literal("ruleTest"),
            z.literal("debugPattern"),
          ]),
          pattern: z.string().min(1).optional(),
          rewrite: z.string().min(1).optional(),
          lang: z.string().min(1).optional(),
          paths: stringArray,
          globs: stringArray,
          strictness: z.string().optional(),
          max_results: z.number().int().positive().optional(),
          context: z.number().int().nonnegative().optional(),
          apply: z.boolean().default(false),
          rule_file: z.string().min(1).optional(),
          inline_rules: z.string().min(1).optional(),
          config: z.string().min(1).optional(),
          filter: z.string().min(1).optional(),
          test_dir: z.string().min(1).optional(),
          snapshot_dir: z.string().min(1).optional(),
          update_snapshots: z.boolean().default(false),
          format: z
            .union([z.literal("ast"), z.literal("cst"), z.literal("sexp"), z.literal("pattern")])
            .optional(),
        },
        execute: async (input, context) => {
          if (input.operation === "search") return executeSearch(input, context, runner);
          if (input.operation === "replace") return executeReplace(input, context, runner);
          if (input.operation === "scan") return executeScan(input, context, runner);
          if (input.operation === "ruleTest") return executeRuleTest(input, context, runner);
          if (input.operation === "debugPattern")
            return executeDebugPattern(input, context, runner);
          throw new Error(`Unsupported ast_grep operation: ${input.operation}`);
        },
      }),
    },
  });
}

export default createAstGrepPlugin();
