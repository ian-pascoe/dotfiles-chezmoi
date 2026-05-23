import { afterAll, beforeEach, describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import astGrepPlugin, { createAstGrepPlugin, parseJsonMatches } from "./index";

type AstGrepTools = NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]> & {
  ast_grep: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["ast_grep"];
};

type Command = { bin: string; args: string[] };

const roots: string[] = [];
let root = "";
let commands: Command[] = [];
let askCalls: unknown[] = [];
const originalAstGrepBin = process.env.AST_GREP_BIN;

function runner(stdout = "[]") {
  return async (bin: string, args: string[]) => {
    commands.push({ bin, args });
    return { stdout, stderr: "", exitCode: 0 };
  };
}

async function plugin(commandRunner = runner()) {
  const built = createAstGrepPlugin({ runner: commandRunner });
  return built({
    client: {},
    project: { id: "project-1" },
    directory: root,
    worktree: root,
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://localhost:4096"),
    $: {},
  } as never);
}

async function pluginTools(commandRunner = runner()) {
  const hooks = await plugin(commandRunner);
  assert.ok(hooks.tool?.ast_grep);
  return { hooks, tools: hooks.tool as AstGrepTools };
}

function context(directory = root, ask?: (input: unknown) => Promise<unknown>) {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "build",
    directory,
    worktree: root,
    abort: new AbortController().signal,
    metadata() {},
    ask:
      ask ??
      (async (input: unknown) => {
        askCalls.push(input);
      }),
  } as never;
}

function contextWithoutAsk() {
  const ctx = context() as Record<string, unknown>;
  delete ctx.ask;
  return ctx as never;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-ast-grep-plugin-test-root-"));
  roots.push(root);
  commands = [];
  askCalls = [];
  process.env.AST_GREP_BIN = "/custom/ast-grep";
});

afterAll(async () => {
  if (originalAstGrepBin === undefined) delete process.env.AST_GREP_BIN;
  else process.env.AST_GREP_BIN = originalAstGrepBin;
  await Promise.all(roots.map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
});

describe("ast-grep plugin", () => {
  test("exports OpenCode hooks with one ast-grep tool", async () => {
    const hooks = await astGrepPlugin({
      client: {},
      project: { id: "project-1" },
      directory: root,
      worktree: root,
      experimental_workspace: { register() {} },
      serverUrl: new URL("http://localhost:4096"),
      $: {},
    } as never);

    assert.ok(hooks.tool?.ast_grep);
    assert.equal(Object.keys(hooks.tool).filter((name) => name.startsWith("ast_grep")).length, 1);
    assert.equal(typeof hooks.tool.ast_grep.execute, "function");
  });

  test("builds search command args and formats JSON matches with 1-based ranges", async () => {
    const stdout = JSON.stringify([
      {
        file: "src/app.ts",
        language: "TypeScript",
        lines: "console.log(value)",
        text: "console.log(value)",
        range: { start: { line: 2, column: 4 }, end: { line: 2, column: 22 } },
      },
    ]);
    const { tools } = await pluginTools(runner(stdout));

    const result = String(
      await tools.ast_grep.execute(
        {
          operation: "search",
          pattern: "console.log($A)",
          lang: "ts",
          paths: ["src"],
          globs: ["**/*.ts"],
          strictness: "smart",
        },
        context(),
      ),
    );

    assert.deepEqual(commands[0], {
      bin: "/custom/ast-grep",
      args: [
        "run",
        "--pattern",
        "console.log($A)",
        "--lang",
        "ts",
        "--json",
        "--strictness",
        "smart",
        "--globs",
        "**/*.ts",
        "src",
      ],
    });
    assert.match(result, /src\/app\.ts:3:5-3:23/);
    assert.match(result, /console\.log\(value\)/);
  });

  test("search includes explicit snippet, context lines, and truncation fields", async () => {
    const stdout = JSON.stringify([
      {
        file: "src/app.ts",
        language: "TypeScript",
        lines: "before\nconsole.log(value)\nafter",
        text: "console.log(value)",
        range: { start: { line: 2, column: 4 }, end: { line: 2, column: 22 } },
      },
    ]);
    const { tools } = await pluginTools(runner(stdout));

    const result = String(
      await tools.ast_grep.execute(
        { operation: "search", pattern: "console.log($A)", lang: "ts", paths: ["src"], context: 1 },
        context(),
      ),
    );

    assert.match(result, /snippet:/);
    assert.match(result, /before/);
    assert.match(result, /after/);
    assert.match(result, /truncated: false/);
    assert.match(result, /results_truncated: false/);
  });

  test("search bounds context snippets for zero, one, and multi-line matches", async () => {
    const stdout = JSON.stringify([
      {
        file: "src/app.ts",
        lines: "before\nfirst match\nsecond match\nafter",
        text: "first match\nsecond match",
        range: { start: { line: 10, column: 0 }, end: { line: 11, column: 12 } },
      },
    ]);
    const { tools } = await pluginTools(runner(stdout));

    const zero = String(
      await tools.ast_grep.execute(
        { operation: "search", pattern: "$A", lang: "ts", paths: ["src"], context: 0 },
        context(),
      ),
    );
    const one = String(
      await tools.ast_grep.execute(
        { operation: "search", pattern: "$A", lang: "ts", paths: ["src"], context: 1 },
        context(),
      ),
    );

    assert.match(zero, /snippet: first match\nsecond match/);
    assert.doesNotMatch(zero, /before/);
    assert.doesNotMatch(zero, /after/);
    assert.match(one, /snippet: before\nfirst match\nsecond match\nafter/);
  });

  test("search context zero locates expression inside a full source line", async () => {
    const stdout = JSON.stringify([
      {
        file: "src/app.ts",
        lines: "const before = 1;\nconst value = console.log(input);\nconst after = 2;",
        text: "console.log(input)",
        range: { start: { line: 21, column: 14 }, end: { line: 21, column: 32 } },
      },
    ]);
    const { tools } = await pluginTools(runner(stdout));

    const result = String(
      await tools.ast_grep.execute(
        { operation: "search", pattern: "console.log($A)", lang: "ts", paths: ["src"], context: 0 },
        context(),
      ),
    );

    assert.match(result, /snippet: const value = console\.log\(input\);/);
    assert.doesNotMatch(result, /const before = 1/);
    assert.doesNotMatch(result, /const after = 2/);
  });

  test("reports malformed ast-grep JSON output clearly", async () => {
    const { tools } = await pluginTools(runner("not json"));

    await assert.rejects(
      () =>
        tools.ast_grep.execute(
          { operation: "search", pattern: "$A", lang: "ts", paths: ["src"] },
          context(),
        ),
      /invalid ast-grep json/i,
    );
  });

  test("asks external directory permission for paths outside the worktree", async () => {
    const { tools } = await pluginTools(runner("[]"));

    await tools.ast_grep.execute(
      { operation: "search", pattern: "$A", lang: "ts", paths: ["../outside"] },
      context(),
    );

    assert.equal(commands.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /external_directory/);
    assert.match(commands[0]?.args.at(-1) ?? "", /outside$/);
  });

  test("external directory paths fail closed without permission", async () => {
    const { tools } = await pluginTools();

    await assert.rejects(
      () =>
        tools.ast_grep.execute(
          { operation: "search", pattern: "$A", lang: "ts", paths: ["../outside"] },
          contextWithoutAsk(),
        ),
      /external directory permission.*unavailable/i,
    );
    assert.equal(commands.length, 0);
  });

  test("caps result count and text length with truncation metadata", () => {
    const matches = parseJsonMatches(
      JSON.stringify([
        {
          file: "a.ts",
          text: "x".repeat(3000),
          range: { start: { line: 0, column: 0 }, end: { line: 0, column: 3000 } },
        },
        {
          file: "b.ts",
          text: "second",
          range: { start: { line: 1, column: 0 }, end: { line: 1, column: 6 } },
        },
      ]),
      { maxResults: 1, maxTextLength: 40 },
    );

    assert.equal(matches.matches.length, 1);
    assert.equal(matches.truncated, true);
    assert.equal(matches.matches[0]?.truncatedText, true);
    assert.ok((matches.matches[0]?.text.length ?? 0) <= 40);
  });

  test("surfaces missing binary and invalid pattern errors from the runner", async () => {
    const missing = Object.assign(new Error("spawn ast-grep ENOENT"), { code: "ENOENT" });
    const invalidRunner = async () => ({ stdout: "", stderr: "invalid pattern", exitCode: 2 });
    const { tools: missingTools } = await pluginTools(async () => {
      throw missing;
    });
    const { tools: invalidTools } = await pluginTools(invalidRunner);

    await assert.rejects(
      () =>
        missingTools.ast_grep.execute(
          { operation: "search", pattern: "$A", lang: "ts", paths: ["."] },
          context(),
        ),
      /ast-grep binary not found/i,
    );
    await assert.rejects(
      () =>
        invalidTools.ast_grep.execute(
          { operation: "search", pattern: "(", lang: "ts", paths: ["."] },
          context(),
        ),
      /invalid pattern/i,
    );
  });

  test("replace apply previews, asks edit permission, applies, and verifies remaining matches", async () => {
    const preview = JSON.stringify([
      {
        file: "src/app.ts",
        text: "var a = 1",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 9 } },
      },
    ]);
    const outputs = [preview, "", "[]"];
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: outputs.shift() ?? "[]", stderr: "", exitCode: 0 };
    });

    const result = String(
      await tools.ast_grep.execute(
        {
          operation: "replace",
          pattern: "var $A = $B",
          rewrite: "let $A = $B",
          lang: "ts",
          paths: ["src"],
          apply: true,
        },
        context(),
      ),
    );

    assert.equal(commands.length, 3);
    assert.deepEqual(commands[0]?.args.slice(0, 8), [
      "run",
      "--pattern",
      "var $A = $B",
      "--lang",
      "ts",
      "--json",
      "--rewrite",
      "let $A = $B",
    ]);
    assert.ok(commands[1]?.args.includes("--update-all"));
    assert.equal(commands[1]?.args.at(-1), "src/app.ts");
    assert.notEqual(commands[1]?.args.at(-1), "src");
    assert.equal(askCalls.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /src\/app\.ts/);
    assert.match(result, /Changed files: src\/app\.ts/);
    assert.match(result, /Remaining matches: 0/);
  });

  test("replace apply with no matches is a no-op without edit permission", async () => {
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: "[]", stderr: "", exitCode: 0 };
    });

    const result = String(
      await tools.ast_grep.execute(
        {
          operation: "replace",
          pattern: "var $A = $B",
          rewrite: "let $A = $B",
          lang: "ts",
          paths: ["src"],
          apply: true,
        },
        contextWithoutAsk(),
      ),
    );

    assert.equal(result, "Changed files: none\nRemaining matches: 0");
    assert.equal(commands.length, 1);
  });

  test("replace apply requests permission for every uncapped affected file", async () => {
    const preview = JSON.stringify([
      {
        file: "src/one.ts",
        text: "var a = 1",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 9 } },
      },
      {
        file: "src/two.ts",
        text: "var b = 2",
        range: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } },
      },
    ]);
    const outputs = [preview, "", "[]"];
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: outputs.shift() ?? "[]", stderr: "", exitCode: 0 };
    });

    await tools.ast_grep.execute(
      {
        operation: "replace",
        pattern: "var $A = $B",
        rewrite: "let $A = $B",
        lang: "ts",
        paths: ["src"],
        max_results: 1,
        apply: true,
      },
      context(),
    );

    assert.match(JSON.stringify(askCalls[0]), /src\/one\.ts/);
    assert.match(JSON.stringify(askCalls[0]), /src\/two\.ts/);
  });

  test("replace apply fails closed without edit permission support or when denied", async () => {
    const preview = JSON.stringify([
      {
        file: "src/app.ts",
        text: "var a = 1",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 9 } },
      },
    ]);
    const { tools: missingTools } = await pluginTools(runner(preview));
    const { tools: deniedTools } = await pluginTools(runner(preview));

    await assert.rejects(
      () =>
        missingTools.ast_grep.execute(
          {
            operation: "replace",
            pattern: "var $A = $B",
            rewrite: "let $A = $B",
            lang: "ts",
            paths: ["src"],
            apply: true,
          },
          contextWithoutAsk(),
        ),
      /edit permission.*unavailable/i,
    );
    await assert.rejects(
      () =>
        deniedTools.ast_grep.execute(
          {
            operation: "replace",
            pattern: "var $A = $B",
            rewrite: "let $A = $B",
            lang: "ts",
            paths: ["src"],
            apply: true,
          },
          context(root, async (input) => {
            askCalls.push(input);
            return { type: "deny" };
          }),
        ),
      /denied/i,
    );
  });

  test("replace apply treats non-throwing edit permission as allowed", async () => {
    const preview = JSON.stringify([
      {
        file: "src/app.ts",
        text: "var a = 1",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 9 } },
      },
    ]);
    const outputs = [preview, "", "[]"];
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: outputs.shift() ?? "[]", stderr: "", exitCode: 0 };
    });

    const result = String(
      await tools.ast_grep.execute(
        {
          operation: "replace",
          pattern: "var $A = $B",
          rewrite: "let $A = $B",
          lang: "ts",
          paths: ["src"],
          apply: true,
        },
        context(root, async (input) => {
          askCalls.push(input);
        }),
      ),
    );

    assert.match(result, /Remaining matches: 0/);
    assert.equal(commands.length, 3);
  });

  test("replace apply preserves literal --json pattern, rewrite, and glob values", async () => {
    const preview = JSON.stringify([
      {
        file: "src/app.ts",
        text: "--json",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 6 } },
      },
    ]);
    const outputs = [preview, "", "[]"];
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: outputs.shift() ?? "[]", stderr: "", exitCode: 0 };
    });

    await tools.ast_grep.execute(
      {
        operation: "replace",
        pattern: "--json",
        rewrite: "--json",
        lang: "ts",
        paths: ["src"],
        globs: ["--json"],
        apply: true,
      },
      context(),
    );

    const applyArgs = commands[1]?.args ?? [];
    assert.equal(applyArgs.filter((arg) => arg === "--json").length, 3);
    assert.ok(applyArgs.includes("--update-all"));
  });

  test("scan supports previews and apply with update-all", async () => {
    const stdout = JSON.stringify([
      {
        file: "src/app.ts",
        text: "problem",
        range: { start: { line: 4, column: 1 }, end: { line: 4, column: 8 } },
      },
    ]);
    const { tools } = await pluginTools(runner(stdout));

    const result = String(
      await tools.ast_grep.execute(
        {
          operation: "scan",
          paths: ["src"],
          rule_file: "rules/no-debug.yml",
          filter: "no-debug",
          apply: false,
        },
        context(),
      ),
    );

    assert.deepEqual(commands[0]?.args, [
      "scan",
      "--json",
      "--rule",
      "rules/no-debug.yml",
      "--filter",
      "no-debug",
      "src",
    ]);
    assert.match(result, /src\/app\.ts:5:2-5:9/);
  });

  test("scan validates exactly one rule source", async () => {
    const { tools } = await pluginTools();

    await assert.rejects(
      () => tools.ast_grep.execute({ operation: "scan", paths: ["src"], apply: false }, context()),
      /exactly one/i,
    );
    await assert.rejects(
      () =>
        tools.ast_grep.execute(
          {
            operation: "scan",
            paths: ["src"],
            rule_file: "rules/a.yml",
            inline_rules: "id: a",
            apply: false,
          },
          context(),
        ),
      /exactly one/i,
    );
    assert.equal(commands.length, 0);
  });

  test("scan apply asks, uses update-all, and verifies remaining matches", async () => {
    const preview = JSON.stringify([
      {
        file: "src/app.ts",
        text: "problem",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 7 } },
      },
    ]);
    const outputs = [preview, "", "[]"];
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: outputs.shift() ?? "[]", stderr: "", exitCode: 0 };
    });

    const result = String(
      await tools.ast_grep.execute(
        { operation: "scan", paths: ["src"], rule_file: "rules/no-debug.yml", apply: true },
        context(),
      ),
    );

    assert.equal(commands.length, 3);
    assert.ok(commands[1]?.args.includes("--update-all"));
    assert.equal(commands[1]?.args.at(-1), "src/app.ts");
    assert.notEqual(commands[1]?.args.at(-1), "src");
    assert.equal(commands[2]?.args.includes("--json"), true);
    assert.equal(askCalls.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /src\/app\.ts/);
    assert.match(result, /Changed files: src\/app\.ts/);
    assert.match(result, /Remaining matches: 0/);
  });

  test("scan apply with no matches is a no-op without edit permission", async () => {
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: "[]", stderr: "", exitCode: 0 };
    });

    const result = String(
      await tools.ast_grep.execute(
        { operation: "scan", paths: ["src"], rule_file: "rules/no-debug.yml", apply: true },
        contextWithoutAsk(),
      ),
    );

    assert.equal(result, "Changed files: none\nRemaining matches: 0");
    assert.equal(commands.length, 1);
  });

  test("scan apply preserves literal --json filter and glob values", async () => {
    const preview = JSON.stringify([
      {
        file: "src/app.ts",
        text: "problem",
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 7 } },
      },
    ]);
    const outputs = [preview, "", "[]"];
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: outputs.shift() ?? "[]", stderr: "", exitCode: 0 };
    });

    await tools.ast_grep.execute(
      {
        operation: "scan",
        paths: ["src"],
        rule_file: "rules/no-debug.yml",
        filter: "--json",
        globs: ["--json"],
        apply: true,
      },
      context(),
    );

    const applyArgs = commands[1]?.args ?? [];
    assert.equal(applyArgs.filter((arg) => arg === "--json").length, 2);
    assert.ok(applyArgs.includes("--update-all"));
  });

  test("rule test requests permission when updating snapshots", async () => {
    const { tools } = await pluginTools(runner("tests passed"));

    const result = String(
      await tools.ast_grep.execute(
        {
          operation: "ruleTest",
          test_dir: "rules",
          snapshot_dir: "__snapshots__",
          update_snapshots: true,
        },
        context(),
      ),
    );

    assert.deepEqual(commands[0]?.args, [
      "test",
      "--test-dir",
      "rules",
      "--snapshot-dir",
      "__snapshots__",
      "--update-all",
    ]);
    assert.equal(askCalls.length, 1);
    assert.match(result, /tests passed/);
  });

  test("rule test requests default write permission when updating default snapshots", async () => {
    const { tools } = await pluginTools(runner("updated snapshots"));

    await tools.ast_grep.execute({ operation: "ruleTest", update_snapshots: true }, context());

    assert.equal(askCalls.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /\./);
    assert.deepEqual(commands[0]?.args, ["test", "--update-all"]);
  });

  test("debug pattern runs debug-query against empty input and normalizes stderr output", async () => {
    const { tools } = await pluginTools(async (bin, args) => {
      commands.push({ bin, args });
      return { stdout: "repo search match", stderr: "debug tree", exitCode: 1 };
    });

    const result = String(
      await tools.ast_grep.execute(
        { operation: "debugPattern", pattern: "console.log($A)", lang: "ts", format: "ast" },
        context(),
      ),
    );

    assert.deepEqual(commands[0]?.args, [
      "run",
      "--pattern",
      "console.log($A)",
      "--lang",
      "ts",
      "--debug-query=ast",
      "/dev/null",
    ]);
    assert.match(result, /ast-grep debug-query output:/);
    assert.doesNotMatch(result, /repo search match/);
    assert.match(result, /debug tree/);
  });
});
