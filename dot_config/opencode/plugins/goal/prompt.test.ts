import { describe, test } from "vitest";
import assert from "node:assert/strict";

import { buildBudgetLimitedPrompt, buildContinuationPrompt } from "./prompt";
import type { Goal } from "./types";

const goal: Goal = {
  id: "goal-1",
  objective: 'finish <unsafe> & "quoted" work',
  status: "active",
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
  timeUsedSeconds: 12,
  tokenBudget: 100,
  tokenUsage: { input: 30, output: 20, total: 50 },
};

describe("goal prompts", () => {
  test("builds continuation prompts with escaped objective and completion audit instructions", () => {
    const prompt = buildContinuationPrompt(goal);

    assert.match(
      prompt,
      /<objective>finish &lt;unsafe&gt; &amp; &quot;quoted&quot; work<\/objective>/,
    );
    assert.match(prompt, /update_goal/);
    assert.match(prompt, /status[\s\S]*complete/);
    assert.match(prompt, /completion audit/i);
    assert.doesNotMatch(prompt, /<objective>finish <unsafe>/);
  });

  test("builds budget-limited prompts with escaped objective and completion audit text", () => {
    const prompt = buildBudgetLimitedPrompt(goal);

    assert.match(prompt, /budget/i);
    assert.match(
      prompt,
      /<objective>finish &lt;unsafe&gt; &amp; &quot;quoted&quot; work<\/objective>/,
    );
    assert.match(prompt, /update_goal/);
    assert.match(prompt, /completion audit/i);
  });
});
