import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { validateObjective, validateTokenBudget } from "./validation";

describe("validateObjective", () => {
  test("trims valid objectives", () => {
    assert.equal(validateObjective("  finish task  "), "finish task");
  });

  test("rejects empty objectives", () => {
    assert.throws(() => validateObjective("   "), /objective/i);
  });

  test("rejects objectives over 4000 characters with a file hint", () => {
    assert.throws(() => validateObjective("x".repeat(4001)), /file/i);
  });
});

describe("validateTokenBudget", () => {
  test("accepts missing budgets", () => {
    assert.equal(validateTokenBudget(undefined), undefined);
    assert.equal(validateTokenBudget(null), undefined);
  });

  test("accepts positive safe integer budgets", () => {
    assert.equal(validateTokenBudget(1), 1);
    assert.equal(validateTokenBudget(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  });

  test("rejects invalid budgets", () => {
    for (const budget of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "100"] as const) {
      assert.throws(() => validateTokenBudget(budget), /positive safe integer/i);
    }
  });
});
