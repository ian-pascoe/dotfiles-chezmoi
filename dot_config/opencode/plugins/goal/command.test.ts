import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { parseGoalCommand } from "./command";

describe("parseGoalCommand", () => {
  test("shows the current goal when no arguments are provided", () => {
    assert.deepEqual(parseGoalCommand(""), { type: "show" });
    assert.deepEqual(parseGoalCommand("   \t  "), { type: "show" });
    assert.deepEqual(parseGoalCommand("show"), { type: "show" });
  });

  test("parses lifecycle commands exactly like Codex", () => {
    assert.deepEqual(parseGoalCommand("pause"), { type: "setStatus", status: "paused" });
    assert.deepEqual(parseGoalCommand(" resume "), { type: "setStatus", status: "active" });
    assert.deepEqual(parseGoalCommand("clear"), { type: "clear" });
  });

  test("parses explicit set objectives without preserving the set prefix", () => {
    assert.deepEqual(parseGoalCommand("set ship the goal loop"), {
      type: "setObjective",
      objective: "ship the goal loop",
    });
  });

  test("treats status, help, complete, and all other text as objectives", () => {
    assert.deepEqual(parseGoalCommand("status"), { type: "setObjective", objective: "status" });
    assert.deepEqual(parseGoalCommand("help"), { type: "setObjective", objective: "help" });
    assert.deepEqual(parseGoalCommand("complete"), { type: "setObjective", objective: "complete" });
    assert.deepEqual(parseGoalCommand("  ship the goal loop  "), {
      type: "setObjective",
      objective: "ship the goal loop",
    });
  });
});
