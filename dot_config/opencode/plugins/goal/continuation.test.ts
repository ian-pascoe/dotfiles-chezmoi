import { describe, test } from "vitest";
import assert from "node:assert/strict";

import {
  shouldQueueGoalContinuationAfterAgentEnd,
  shouldQueueGoalContinuationWhenIdle,
} from "./continuation";
import type { Goal } from "./types";

function goal(status: Goal["status"]): Goal {
  return {
    id: "goal-1",
    objective: "finish",
    status,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    timeUsedSeconds: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
  };
}

describe("continuation policy", () => {
  test("queues on idle only for active goals with no pending messages", () => {
    assert.equal(shouldQueueGoalContinuationWhenIdle(goal("active"), true, false), true);
    assert.equal(shouldQueueGoalContinuationWhenIdle(goal("active"), false, false), false);
    assert.equal(shouldQueueGoalContinuationWhenIdle(goal("active"), true, true), false);
    assert.equal(shouldQueueGoalContinuationWhenIdle(goal("paused"), true, false), false);
    assert.equal(shouldQueueGoalContinuationWhenIdle(goal("budgetLimited"), true, false), false);
    assert.equal(shouldQueueGoalContinuationWhenIdle(goal("complete"), true, false), false);
  });

  test("queues after agent end only for active goals with no pending messages", () => {
    assert.equal(shouldQueueGoalContinuationAfterAgentEnd(goal("active"), false), true);
    assert.equal(shouldQueueGoalContinuationAfterAgentEnd(goal("active"), true), false);
    assert.equal(shouldQueueGoalContinuationAfterAgentEnd(goal("paused"), false), false);
    assert.equal(shouldQueueGoalContinuationAfterAgentEnd(goal("budgetLimited"), false), false);
    assert.equal(shouldQueueGoalContinuationAfterAgentEnd(goal("complete"), false), false);
  });
});
