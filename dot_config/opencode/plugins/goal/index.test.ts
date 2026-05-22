import { afterAll, beforeEach, describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import goalPlugin from "./index";
import { readGoal } from "./store";
import { buildGoalStoreRef } from "./index";

type GoalTools = NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]> & {
  create_goal: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["create_goal"];
  get_goal: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["get_goal"];
  update_goal: NonNullable<Awaited<ReturnType<typeof plugin>>["tool"]>["update_goal"];
};

const roots: string[] = [];
let root = "";
let stateRoot = "";
const originalXdgStateHome = process.env.XDG_STATE_HOME;

function textPartText(parts: Array<{ type: string; text?: string }>): string {
  return parts.map((part) => (part.type === "text" ? part.text : "")).join("\n");
}

async function plugin(client: unknown = { session: {} }) {
  return goalPlugin({
    client,
    project: { id: "project-1" },
    directory: root,
    worktree: root,
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://localhost:4096"),
    $: {},
  } as never);
}

async function pluginTools(client: unknown = { session: {} }) {
  const hooks = await plugin(client);
  assert.ok(hooks.tool?.create_goal);
  assert.ok(hooks.tool.get_goal);
  assert.ok(hooks.tool.update_goal);
  return { hooks, tools: hooks.tool as GoalTools };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-goal-plugin-test-root-"));
  stateRoot = await mkdtemp(join(tmpdir(), "opencode-goal-plugin-test-state-"));
  roots.push(root, stateRoot);
  process.env.XDG_STATE_HOME = stateRoot;
});

afterAll(async () => {
  if (originalXdgStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalXdgStateHome;
  await Promise.all(roots.map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
});

describe("goal plugin", () => {
  test("exports OpenCode hooks with goal tools", async () => {
    const { hooks, tools } = await pluginTools();

    assert.equal(typeof hooks["command.execute.before"], "function");
    assert.equal(typeof hooks.event, "function");
    assert.equal(typeof hooks["experimental.session.compacting"], "function");
    assert.equal(typeof tools.create_goal.execute, "function");
    assert.equal(typeof tools.get_goal.execute, "function");
    assert.equal(typeof tools.update_goal.execute, "function");
  });

  test("goal tools create, read, reject duplicates, and complete goals", async () => {
    const { tools } = await pluginTools();
    const context = {
      sessionID: "session-tools",
      messageID: "message-1",
      agent: "build",
      directory: root,
      worktree: root,
      abort: new AbortController().signal,
      metadata() {},
      ask() {},
    } as never;

    const created = await tools.create_goal.execute(
      { objective: " finish plugin ", token_budget: 1000 },
      context,
    );
    assert.match(String(created), /finish plugin/);
    await assert.rejects(
      () => tools.create_goal.execute({ objective: "second" }, context),
      /already exists/i,
    );

    assert.match(String(await tools.get_goal.execute({}, context)), /finish plugin/);
    await assert.rejects(
      () => tools.update_goal.execute({ status: "paused" } as never, context),
      /complete/i,
    );
    const completed = String(await tools.update_goal.execute({ status: "complete" }, context));
    assert.match(completed, /completionBudgetReport/);
    assert.equal(
      (
        await readGoal(
          await buildGoalStoreRef({ sessionID: "session-tools", directory: root, worktree: root }),
        )
      )?.status,
      "complete",
    );
  });

  test("handles /goal commands by mutating command output", async () => {
    const hooks = await plugin();
    const output = { parts: [] };

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command-empty", arguments: "pause" },
      output,
    );
    assert.match(textPartText(output.parts), /No OpenCode goal/);

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command", arguments: "ship it" },
      output,
    );
    assert.match(textPartText(output.parts), /Continue working on the active goal/);
    assert.match(textPartText(output.parts), /ship it/);

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command", arguments: "show" },
      output,
    );
    assert.match(textPartText(output.parts), /ship it/);
    assert.doesNotMatch(textPartText(output.parts), /Continue working/);

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command", arguments: "set launch it" },
      output,
    );
    assert.match(textPartText(output.parts), /launch it/);
    assert.doesNotMatch(textPartText(output.parts), /set launch it/);

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command", arguments: "pause" },
      output,
    );
    assert.match(textPartText(output.parts), /Paused/);
    assert.doesNotMatch(textPartText(output.parts), /Continue working/);

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command", arguments: "resume" },
      output,
    );
    assert.match(textPartText(output.parts), /Continue working on the active goal/);

    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-command", arguments: "clear" },
      output,
    );
    assert.match(textPartText(output.parts), /cleared/i);
    assert.doesNotMatch(textPartText(output.parts), /Continue working/);
  });

  test("accounts assistant tokens on idle and queues continuation once", async () => {
    const prompts: unknown[] = [];
    const client = {
      session: {
        messages: async () => [
          {
            info: {
              id: "assistant-1",
              role: "assistant",
              tokens: { input: 4, output: 6, reasoning: 0, cache: { read: 0, write: 0 } },
              time: { created: 0, completed: 2000 },
            },
            parts: [],
          },
        ],
        prompt: async (input: unknown) => {
          prompts.push(input);
          return { info: {}, parts: [] };
        },
      },
    };
    const { hooks } = await pluginTools(client);
    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-idle", arguments: "keep going" },
      { parts: [] },
    );

    await hooks.event?.({
      event: { type: "session.idle", properties: { sessionID: "session-idle" } } as never,
    });
    await hooks.event?.({
      event: { type: "session.idle", properties: { sessionID: "session-idle" } } as never,
    });

    const goal = await readGoal(
      await buildGoalStoreRef({ sessionID: "session-idle", directory: root, worktree: root }),
    );
    assert.equal(goal?.tokenUsage.total, 10);
    assert.equal(goal?.timeUsedSeconds, 2);
    assert.equal(goal?.lastAccountedAssistantMessageID, "assistant-1");
    assert.equal(prompts.length, 2);
    const promptInput = prompts[0] as {
      path?: { id?: string };
      query?: { directory?: string };
      body?: { agent?: string; parts?: Array<{ type: string; text?: string }> };
    };
    assert.equal(promptInput.path?.id, "session-idle");
    assert.equal(promptInput.query?.directory, root);
    assert.equal(promptInput.body?.agent, "build");
    assert.match(promptInput.body?.parts?.[0]?.text ?? "", /Continue working on the active goal/);
  });

  test("sends the budget-limited idle prompt at most once", async () => {
    const prompts: unknown[] = [];
    const client = {
      session: {
        messages: async () => [
          {
            info: {
              id: "assistant-1",
              role: "assistant",
              tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
              time: { created: 0, completed: 1000 },
            },
            parts: [],
          },
        ],
        prompt: async (input: unknown) => {
          prompts.push(input);
          return { info: {}, parts: [] };
        },
      },
    };
    const { hooks, tools } = await pluginTools(client);
    const context = {
      sessionID: "session-budget",
      messageID: "message-1",
      agent: "build",
      directory: root,
      worktree: root,
      abort: new AbortController().signal,
      metadata() {},
      ask() {},
    } as never;
    await tools.create_goal.execute({ objective: "stay under budget", token_budget: 5 }, context);

    await hooks.event?.({
      event: { type: "session.idle", properties: { sessionID: "session-budget" } } as never,
    });
    await hooks.event?.({
      event: { type: "session.idle", properties: { sessionID: "session-budget" } } as never,
    });

    const goal = await readGoal(
      await buildGoalStoreRef({ sessionID: "session-budget", directory: root, worktree: root }),
    );
    assert.equal(goal?.status, "budgetLimited");
    assert.equal(typeof goal?.budgetLimitPromptSentAt, "string");
    assert.equal(prompts.length, 1);
    assert.match(
      (prompts[0] as { body?: { parts?: Array<{ text?: string }> } }).body?.parts?.[0]?.text ?? "",
      /reached its token budget/,
    );
  });

  test("appends active goal context during compaction", async () => {
    const hooks = await plugin();
    await hooks["command.execute.before"]?.(
      { command: "goal", sessionID: "session-compact", arguments: "preserve context" },
      { parts: [] },
    );

    const output = { context: [] as string[] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-compact" }, output);

    assert.equal(output.context.length, 1);
    assert.match(output.context[0] ?? "", /preserve context/);
    assert.match(output.context[0] ?? "", /Active OpenCode goal/);
  });
});
