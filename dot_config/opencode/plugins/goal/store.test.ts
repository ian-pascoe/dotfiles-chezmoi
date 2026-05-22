import { afterAll, beforeEach, describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  accountGoalUsage,
  clearGoal,
  createGoal,
  goalFilePath,
  readGoal,
  updateGoal,
  writeGoal,
} from "./store";
import type { GoalStoreRef } from "./types";

let root = "";
let ref: GoalStoreRef;
const roots: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-goal-test-"));
  roots.push(root);
  ref = { stateDir: root, projectKey: "project-a", sessionID: "session-a" };
});

afterAll(async () => {
  await Promise.all(roots.map((tempRoot) => rm(tempRoot, { recursive: true, force: true })));
});

describe("goal store", () => {
  test("builds the versioned goal file path", () => {
    assert.equal(goalFilePath(ref), join(root, "project-a", "session-a", "goal.json"));
  });

  test("creates, reads, and refuses to replace existing goals", async () => {
    const created = await createGoal(ref, "  finish task  ", 1000);

    assert.equal(created.objective, "finish task");
    assert.equal(created.status, "active");
    assert.equal(created.tokenBudget, 1000);
    assert.deepEqual(created.tokenUsage, { input: 0, output: 0, total: 0 });
    assert.deepEqual(await readGoal(ref), created);
    await assert.rejects(() => createGoal(ref, "new task"), /already exists/i);
  });

  test("updates status and records completion time", async () => {
    await createGoal(ref, "finish task");
    const complete = await updateGoal(ref, { status: "complete" });

    assert.equal(complete.status, "complete");
    assert.equal(typeof complete.completedAt, "string");
  });

  test("replaces objective with a fresh active goal and resets usage", async () => {
    const first = await createGoal(ref, "first", 10);
    await accountGoalUsage(ref, { input: 5, output: 2 }, 4);
    const replacement = await updateGoal(ref, { objective: "second", tokenBudget: 20 });

    assert.notEqual(replacement.id, first.id);
    assert.equal(replacement.objective, "second");
    assert.equal(replacement.status, "active");
    assert.equal(replacement.tokenBudget, 20);
    assert.deepEqual(replacement.tokenUsage, { input: 0, output: 0, total: 0 });
    assert.equal(replacement.timeUsedSeconds, 0);
  });

  test("resumes a paused goal when setting the same objective", async () => {
    await createGoal(ref, "same");
    await updateGoal(ref, { status: "paused" });
    const updated = await updateGoal(ref, { objective: " same " });

    assert.equal(updated.objective, "same");
    assert.equal(updated.status, "active");
  });

  test("applies token budget changes when setting the same objective", async () => {
    await createGoal(ref, "same", 10);
    await updateGoal(ref, { status: "paused" });
    const updated = await updateGoal(ref, { objective: " same ", tokenBudget: 20 });

    assert.equal(updated.objective, "same");
    assert.equal(updated.status, "active");
    assert.equal(updated.tokenBudget, 20);
  });

  test("moves active goals to budgetLimited when accounting reaches budget", async () => {
    await createGoal(ref, "budgeted", 10);
    const updated = await accountGoalUsage(ref, { input: 3, output: 7 }, 7);

    assert.deepEqual(updated.tokenUsage, { input: 3, output: 7, total: 10 });
    assert.equal(updated.timeUsedSeconds, 7);
    assert.equal(updated.status, "budgetLimited");
  });

  test("accounts assistant message usage idempotently", async () => {
    await createGoal(ref, "budgeted", 100);

    const first = await accountGoalUsage(ref, { input: 3, output: 7 }, 2.9, "message-1");
    const second = await accountGoalUsage(ref, { input: 3, output: 7 }, 2.9, "message-1");
    const third = await accountGoalUsage(ref, { input: 1, output: 1 }, 1, "message-2");

    assert.deepEqual(first.tokenUsage, { input: 3, output: 7, total: 10 });
    assert.equal(first.timeUsedSeconds, 2);
    assert.equal(first.lastAccountedAssistantMessageID, "message-1");
    assert.deepEqual(second.tokenUsage, { input: 3, output: 7, total: 10 });
    assert.equal(second.timeUsedSeconds, 2);
    assert.deepEqual(third.tokenUsage, { input: 4, output: 8, total: 12 });
    assert.equal(third.lastAccountedAssistantMessageID, "message-2");
  });

  test("validates accounting input values", async () => {
    await createGoal(ref, "budgeted", 100);

    for (const usage of [
      { input: -1, output: 0 },
      { input: 0.5, output: 0 },
      { input: Number.MAX_SAFE_INTEGER + 1, output: 0 },
      { input: 0, output: -1 },
      { input: 0, output: 1.5 },
      { input: 0, output: Number.NaN },
    ]) {
      await assert.rejects(() => accountGoalUsage(ref, usage, 1), /non-negative safe integer/i);
    }

    for (const elapsed of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await assert.rejects(
        () => accountGoalUsage(ref, { input: 0, output: 0 }, elapsed),
        /finite non-negative/i,
      );
    }
  });

  test("removes completedAt when moving a complete goal to non-complete status", async () => {
    await createGoal(ref, "finish task");
    const complete = await updateGoal(ref, { status: "complete" });
    assert.equal(typeof complete.completedAt, "string");

    const active = await updateGoal(ref, { status: "active" });
    const paused = await updateGoal(ref, { status: "paused" });

    assert.equal(active.completedAt, undefined);
    assert.equal(paused.completedAt, undefined);
  });

  test("does not retain completedAt when same objective resumes a complete goal", async () => {
    await createGoal(ref, "same");
    await updateGoal(ref, { status: "complete" });
    const resumed = await updateGoal(ref, { objective: "same" });

    assert.equal(resumed.status, "active");
    assert.equal(resumed.completedAt, undefined);
  });

  test("validates parsed goal file shape", async () => {
    const path = goalFilePath(ref);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ version: 1, goal: { id: "bad", objective: "missing fields" } }),
      "utf8",
    );

    await assert.rejects(() => readGoal(ref), /invalid goal file/i);
  });

  test("preserves versioned file after clearing a goal", async () => {
    await createGoal(ref, "finish task");
    await clearGoal(ref);

    assert.equal(await readGoal(ref), undefined);
    assert.deepEqual(JSON.parse(await readFile(goalFilePath(ref), "utf8")), { version: 1 });
  });

  test("writes goals atomically in a versioned JSON file", async () => {
    const goal = await createGoal(ref, "atomic");
    await writeGoal(ref, { ...goal, objective: "written" });

    assert.equal((await readGoal(ref))?.objective, "written");
    assert.deepEqual(JSON.parse(await readFile(goalFilePath(ref), "utf8")), {
      version: 1,
      goal: { ...goal, objective: "written" },
    });
  });
});
