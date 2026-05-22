import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { formatGoalForTool, formatGoalToolResponse } from "./format";
import type { Goal } from "./types";

const goal: Goal = {
  id: "goal-1",
  objective: "finish task",
  status: "active",
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:10:00.000Z",
  timeUsedSeconds: 3661,
  tokenBudget: 5000,
  tokenUsage: { input: 1200, output: 3400, total: 4600 },
};

describe("goal formatting", () => {
  test("formats goals for tools with compact labels", () => {
    const formatted = formatGoalForTool(goal);

    assert.equal(formatted.status, "Active");
    assert.equal(formatted.elapsed, "1h 1m");
    assert.equal(formatted.tokens, "4.6k/5k");
    assert.equal(formatted.remainingTokens, 400);
  });

  test("formats JSON tool responses with optional completion budget report", () => {
    assert.deepEqual(JSON.parse(formatGoalToolResponse(goal)), {
      goal: formatGoalForTool(goal),
      remainingTokens: 400,
    });

    assert.deepEqual(JSON.parse(formatGoalToolResponse(goal, "Completed within budget.")), {
      goal: formatGoalForTool(goal),
      remainingTokens: 400,
      completionBudgetReport: "Completed within budget.",
    });
  });
});
