import { afterAll, beforeEach, describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import astGrepPlugin, { createAstGrepPlugin, parseJsonMatches } from "./index";

type AstGrepTools = NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]> & {
  ast_grep_search: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["ast_grep_search"];
  ast_grep_replace: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["ast_grep_replace"];
  ast_grep_scan: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["ast_grep_scan"];
  ast_grep_rule_test: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["ast_grep_rule_test"];
  ast_grep_debug_pattern: NonNullable<
    Awaited<ReturnType<typeof plugin>>["tool"]
  >["ast_grep_debug_pattern"];
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
  assert.ok(hooks.tool?.ast_grep_search);
  assert.ok(hooks.tool.ast_grep_replace);
  assert.ok(hooks.tool.ast_grep_scan);
  assert.ok(hooks.tool.ast_grep_rule_test);
  assert.ok(hooks.tool.ast_grep_debug_pattern);
  return { hooks, tools: hooks.tool as AstGrepTools };
}

function context(directory = root) {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "build",
    directory,
    worktree: root,
    abort: new AbortController().signal,
    metadata() {},
    ask(input: unknown) {
      askCalls.push(input);
      return Promise.resolve({ type: "allow" });
    },
  } as never;
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
  test("exports OpenCode hooks with five ast-grep tools", async () => {
    const hooks = await astGrepPlugin({
      client: {},
      project: { id: "project-1" },
      directory: root,
      worktree: root,
      experimental_workspace: { register() {} },
      serverUrl: new URL("http://localhost:4096"),
      $: {},
    } as never);

    assert.ok(hooks.tool?.ast_grep_search);
    assert.ok(hooks.tool.ast_grep_replace);
    assert.ok(hooks.tool.ast_grep_scan);
    assert.ok(hooks.tool.ast_grep_rule_test);
    assert.ok(hooks.tool.ast_grep_debug_pattern);
    assert.equal(typeof hooks.tool.ast_grep_search.execute, "function");
    assert.equal(typeof hooks.tool.ast_grep_replace.execute, "function");
    assert.equal(typeof hooks.tool.ast_grep_scan.execute, "function");
    assert.equal(typeof hooks.tool.ast_grep_rule_test.execute, "function");
    assert.equal(typeof hooks.tool.ast_grep_debug_pattern.execute, "function");
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
      await tools.ast_grep_search.execute(
        {
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
      await tools.ast_grep_search.execute(
        { pattern: "console.log($A)", lang: "ts", paths: ["src"], context: 1 },
        context(),
      ),
    );

    assert.match(result, /snippet:/);
    assert.match(result, /before/);
    assert.match(result, /after/);
    assert.match(result, /truncated: false/);
    assert.match(result, /results_truncated: false/);
  });

  test("rejects paths outside the worktree", async () => {
    const { tools } = await pluginTools();

    await assert.rejects(
      () =>
        tools.ast_grep_search.execute(
          { pattern: "$A", lang: "ts", paths: ["../outside"] },
          context(),
        ),
      /outside worktree/i,
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
        missingTools.ast_grep_search.execute(
          { pattern: "$A", lang: "ts", paths: ["."] },
          context(),
        ),
      /ast-grep binary not found/i,
    );
    await assert.rejects(
      () =>
        invalidTools.ast_grep_search.execute({ pattern: "(", lang: "ts", paths: ["."] }, context()),
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
      await tools.ast_grep_replace.execute(
        { pattern: "var $A = $B", rewrite: "let $A = $B", lang: "ts", paths: ["src"], apply: true },
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
    assert.equal(askCalls.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /src\/app\.ts/);
    assert.match(result, /Changed files: src\/app\.ts/);
    assert.match(result, /Remaining matches: 0/);
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

    await tools.ast_grep_replace.execute(
      {
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
      await tools.ast_grep_scan.execute(
        { paths: ["src"], rule_file: "rules/no-debug.yml", filter: "no-debug", apply: false },
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
      () => tools.ast_grep_scan.execute({ paths: ["src"], apply: false }, context()),
      /exactly one/i,
    );
    await assert.rejects(
      () =>
        tools.ast_grep_scan.execute(
          { paths: ["src"], rule_file: "rules/a.yml", inline_rules: "id: a", apply: false },
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
      await tools.ast_grep_scan.execute(
        { paths: ["src"], rule_file: "rules/no-debug.yml", apply: true },
        context(),
      ),
    );

    assert.equal(commands.length, 3);
    assert.ok(commands[1]?.args.includes("--update-all"));
    assert.equal(commands[2]?.args.includes("--json"), true);
    assert.equal(askCalls.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /src\/app\.ts/);
    assert.match(result, /Changed files: src\/app\.ts/);
    assert.match(result, /Remaining matches: 0/);
  });

  test("rule test requests permission when updating snapshots", async () => {
    const { tools } = await pluginTools(runner("tests passed"));

    const result = String(
      await tools.ast_grep_rule_test.execute(
        { test_dir: "rules", snapshot_dir: "__snapshots__", update_snapshots: true },
        context(),
      ),
    );

    assert.deepEqual(commands[0]?.args, [
      "test",
      "--test-dir",
      "rules",
      "--snapshot-dir",
      "__snapshots__",
      "--update",
    ]);
    assert.equal(askCalls.length, 1);
    assert.match(result, /tests passed/);
  });

  test("rule test requests default write permission when updating default snapshots", async () => {
    const { tools } = await pluginTools(runner("updated snapshots"));

    await tools.ast_grep_rule_test.execute({ update_snapshots: true }, context());

    assert.equal(askCalls.length, 1);
    assert.match(JSON.stringify(askCalls[0]), /\./);
    assert.deepEqual(commands[0]?.args, ["test", "--update"]);
  });

  test("debug pattern runs debug-query command", async () => {
    const { tools } = await pluginTools(runner("debug tree"));

    const result = String(
      await tools.ast_grep_debug_pattern.execute(
        { pattern: "console.log($A)", lang: "ts", format: "ast" },
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
    ]);
    assert.match(result, /debug tree/);
  });
});
