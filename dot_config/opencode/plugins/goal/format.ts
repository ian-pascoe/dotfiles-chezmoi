import type { Goal } from "./types";

const STATUS_LABELS: Record<Goal["status"], string> = {
  active: "Active",
  paused: "Paused",
  budgetLimited: "Budget limited",
  complete: "Complete",
};

function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  const compact = value / 1000;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
}

function compactElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(0, Math.floor(seconds))}s`;
}

export function remainingTokens(goal: Goal): number | undefined {
  return goal.tokenBudget === undefined
    ? undefined
    : Math.max(0, goal.tokenBudget - goal.tokenUsage.total);
}

export function formatGoalForTool(goal: Goal) {
  const formatted: {
    id: string;
    objective: string;
    status: string;
    elapsed: string;
    tokens: string;
    remainingTokens: number | undefined;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  } = {
    id: goal.id,
    objective: goal.objective,
    status: STATUS_LABELS[goal.status],
    elapsed: compactElapsed(goal.timeUsedSeconds),
    tokens:
      goal.tokenBudget === undefined
        ? compactNumber(goal.tokenUsage.total)
        : `${compactNumber(goal.tokenUsage.total)}/${compactNumber(goal.tokenBudget)}`,
    remainingTokens: remainingTokens(goal),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
  if (goal.completedAt !== undefined) formatted.completedAt = goal.completedAt;

  return formatted;
}

export function formatGoalToolResponse(goal: Goal, completionBudgetReport?: string): string {
  const response: {
    goal: ReturnType<typeof formatGoalForTool>;
    remainingTokens: number | undefined;
    completionBudgetReport?: string;
  } = {
    goal: formatGoalForTool(goal),
    remainingTokens: remainingTokens(goal),
  };
  if (completionBudgetReport !== undefined)
    response.completionBudgetReport = completionBudgetReport;

  return JSON.stringify(response);
}
