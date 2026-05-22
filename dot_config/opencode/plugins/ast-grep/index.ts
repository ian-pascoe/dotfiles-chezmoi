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

function resolvePath(input: string, context: ToolContext): string {
  const worktree = resolve(context.worktree);
  const directory = resolve(context.directory);
  const absolute = resolve(directory, input);
  if (!isInsideWorktree(absolute, worktree)) throw new Error(`Path is outside worktree: ${input}`);
  return relative(directory, absolute) || ".";
}

function resolvePaths(paths: string[] | undefined, context: ToolContext): string[] {
  return (paths?.length ? paths : ["."]).map((path) => resolvePath(path, context));
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
    throw new Error("ast_grep_scan requires exactly one of rule_file or inline_rules.");
  }
}

function buildScanArgs(
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
  if (input.rule_file) args.push("--rule", resolvePath(input.rule_file, context));
  if (input.inline_rules) args.push("--inline-rules", input.inline_rules);
  if (input.config) args.push("--config", resolvePath(input.config, context));
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
    result = await ask({ type: "edit", paths });
  } catch (error) {
    throw new Error(`Edit permission denied for ast-grep apply: ${(error as Error).message}`);
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("type" in result) ||
    (result as { type?: string }).type !== "allow"
  ) {
    throw new Error("Edit permission denied for ast-grep apply.");
  }
}

const z = tool.schema;
const stringArray = z.array(z.string().min(1)).optional();

export function createAstGrepPlugin(options: { runner?: Runner } = {}): Plugin {
  const runner = options.runner ?? defaultRunner;
  return async () => ({
    tool: {
      ast_grep_search: tool({
        description: "Run structural ast-grep search across files or directories.",
        args: {
          pattern: z.string().min(1),
          lang: z.string().min(1),
          paths: stringArray,
          globs: stringArray,
          strictness: z.string().optional(),
          max_results: z.number().int().positive().optional(),
          context: z.number().int().nonnegative().optional(),
        },
        execute: async (input, context) => {
          const args = buildRunArgs(input, resolvePaths(input.paths, context), true);
          const result = await runAstGrep(runner, args, context);
          return formatMatches(parseJsonMatches(result.stdout, { maxResults: input.max_results }), {
            contextLines: input.context,
          });
        },
      }),
      ast_grep_replace: tool({
        description: "Preview or apply structural ast-grep replacements.",
        args: {
          pattern: z.string().min(1),
          rewrite: z.string().min(1),
          lang: z.string().min(1),
          paths: stringArray,
          globs: stringArray,
          strictness: z.string().optional(),
          max_results: z.number().int().positive().optional(),
          apply: z.boolean().default(false),
        },
        execute: async (input, context) => {
          const paths = resolvePaths(input.paths, context);
          const previewArgs = buildReplaceArgs(input, paths, { json: true });
          const previewOutput = (await runAstGrep(runner, previewArgs, context)).stdout;
          const uncappedPreview = parseJsonMatches(previewOutput, {
            maxResults: Number.MAX_SAFE_INTEGER,
          });
          const preview = parseJsonMatches(previewOutput, { maxResults: input.max_results });
          if (!input.apply) return formatMatches(preview);

          const files = affectedFiles(uncappedPreview);
          await askEdit(context, files);
          const applyArgs = buildReplaceArgs(input, paths, { updateAll: true });
          await runAstGrep(runner, applyArgs, context);
          const verifyArgs = buildRunArgs(input, paths, true);
          const remaining = parseJsonMatches(
            (await runAstGrep(runner, verifyArgs, context)).stdout,
            {
              maxResults: input.max_results,
            },
          );
          return `Changed files: ${files.join(", ") || "none"}\nRemaining matches: ${remaining.total}`;
        },
      }),
      ast_grep_scan: tool({
        description: "Run ast-grep rule-config or inline YAML scans.",
        args: {
          paths: stringArray,
          rule_file: z.string().min(1).optional(),
          inline_rules: z.string().min(1).optional(),
          config: z.string().min(1).optional(),
          filter: z.string().min(1).optional(),
          globs: stringArray,
          max_results: z.number().int().positive().optional(),
          apply: z.boolean().default(false),
        },
        execute: async (input, context) => {
          validateScanRuleSource(input);
          const paths = resolvePaths(input.paths, context);
          const args = buildScanArgs(input, paths, context, { json: true });
          const previewOutput = (await runAstGrep(runner, args, context)).stdout;
          const uncappedPreview = parseJsonMatches(previewOutput, {
            maxResults: Number.MAX_SAFE_INTEGER,
          });
          const preview = parseJsonMatches(previewOutput, { maxResults: input.max_results });
          if (!input.apply) return formatMatches(preview);

          const files = affectedFiles(uncappedPreview);
          await askEdit(context, files);
          await runAstGrep(
            runner,
            buildScanArgs(input, paths, context, { updateAll: true }),
            context,
          );
          const remaining = parseJsonMatches((await runAstGrep(runner, args, context)).stdout, {
            maxResults: input.max_results,
          });
          return `Changed files: ${files.join(", ") || "none"}\nRemaining matches: ${remaining.total}`;
        },
      }),
      ast_grep_rule_test: tool({
        description: "Run ast-grep test for reusable rule development.",
        args: {
          test_dir: z.string().min(1).optional(),
          snapshot_dir: z.string().min(1).optional(),
          config: z.string().min(1).optional(),
          filter: z.string().min(1).optional(),
          update_snapshots: z.boolean().default(false),
        },
        execute: async (input, context) => {
          const args = ["test"];
          const permissionPaths: string[] = [];
          if (input.test_dir) {
            args.push("--test-dir", resolvePath(input.test_dir, context));
            permissionPaths.push(resolvePath(input.test_dir, context));
          }
          if (input.snapshot_dir) {
            args.push("--snapshot-dir", resolvePath(input.snapshot_dir, context));
            permissionPaths.push(resolvePath(input.snapshot_dir, context));
          }
          if (input.config) args.push("--config", resolvePath(input.config, context));
          if (input.filter) args.push("--filter", input.filter);
          if (input.update_snapshots) {
            await askEdit(context, permissionPaths.length ? permissionPaths : ["."]);
            args.push("--update-all");
          }
          const result = await runAstGrep(runner, args, context);
          return result.stdout || result.stderr || "ast-grep tests passed.";
        },
      }),
      ast_grep_debug_pattern: tool({
        description: "Run ast-grep debug-query to inspect query parsing.",
        args: {
          pattern: z.string().min(1),
          lang: z.string().min(1),
          format: z.union([
            z.literal("ast"),
            z.literal("cst"),
            z.literal("sexp"),
            z.literal("pattern"),
          ]),
        },
        execute: async (input, context) => {
          const result = await runAstGrep(
            runner,
            [
              "run",
              "--pattern",
              input.pattern,
              "--lang",
              input.lang,
              `--debug-query=${input.format}`,
              "/dev/null",
            ],
            context,
          );
          const debugOutput = result.stderr || result.stdout;
          return `ast-grep debug-query output:\n${debugOutput}`;
        },
      }),
    },
  });
}

export default createAstGrepPlugin();
