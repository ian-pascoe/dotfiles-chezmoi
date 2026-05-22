import type { Goal } from "./types";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const COMPLETION_AUDIT = `Before marking the goal complete, perform a completion audit: verify the objective is fully satisfied, relevant checks have passed or are explicitly impossible, and no obvious next step remains. Only then call the update_goal tool with status "complete".`;

export function buildContinuationPrompt(goal: Goal): string {
  return `Continue working on the active goal.

<goal>
<objective>${escapeXml(goal.objective)}</objective>
<status>${goal.status}</status>
</goal>

Persist until the objective is complete or blocked. ${COMPLETION_AUDIT}`;
}

export function buildBudgetLimitedPrompt(goal: Goal): string {
  return `The active goal has reached its token budget.

<goal>
<objective>${escapeXml(goal.objective)}</objective>
<status>${goal.status}</status>
</goal>

Stop new implementation work, summarize the current state, and include what remains. ${COMPLETION_AUDIT}`;
}
