export const GOAL_STATUSES = ["active", "paused", "budgetLimited", "complete"] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface TokenUsageSnapshot {
  input: number;
  output: number;
  total: number;
}

export interface Goal {
  id: string;
  objective: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  tokenBudget?: number;
  lastAccountedAssistantMessageID?: string;
  budgetLimitPromptSentAt?: string;
  tokenUsage: TokenUsageSnapshot;
  timeUsedSeconds: number;
}

export interface GoalFile {
  version: 1;
  goal?: Goal;
}

export interface GoalStoreRef {
  stateDir: string;
  projectKey: string;
  sessionID: string;
}

export interface GoalUpdate {
  objective?: string;
  status?: GoalStatus;
  tokenBudget?: number | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
