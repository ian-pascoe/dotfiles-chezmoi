import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { GOAL_STATUSES } from "./types";
import type {
  Goal,
  GoalFile,
  GoalStatus,
  GoalStoreRef,
  GoalUpdate,
  TokenUsageSnapshot,
} from "./types";
import { isRecord } from "./types";
import { validateObjective, validateTokenBudget } from "./validation";

const VERSION = 1 as const;

export function goalFilePath(ref: GoalStoreRef): string {
  return join(ref.stateDir, ref.projectKey, ref.sessionID, "goal.json");
}

function now(): string {
  return new Date().toISOString();
}

function newGoal(objective: string, tokenBudget?: number): Goal {
  const timestamp = now();
  const goal: Goal = {
    id: randomUUID(),
    objective,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    tokenUsage: { input: 0, output: 0, total: 0 },
    timeUsedSeconds: 0,
  };
  if (tokenBudget !== undefined) goal.tokenBudget = tokenBudget;

  return goal;
}

function isGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && GOAL_STATUSES.includes(value as GoalStatus);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateTokenUsage(value: unknown): TokenUsageSnapshot {
  if (!isRecord(value)) throw new Error("Invalid goal file: tokenUsage must be an object");
  if (
    !isNonNegativeSafeInteger(value.input) ||
    !isNonNegativeSafeInteger(value.output) ||
    !isNonNegativeSafeInteger(value.total)
  ) {
    throw new Error("Invalid goal file: token usage must contain non-negative safe integers");
  }
  if (value.total !== value.input + value.output) {
    throw new Error("Invalid goal file: token usage total must equal input plus output");
  }

  return { input: value.input, output: value.output, total: value.total };
}

function validateOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Invalid goal file: ${field} must be a string`);
  return value;
}

function validateGoal(value: unknown): Goal {
  if (!isRecord(value)) throw new Error("Invalid goal file: goal must be an object");
  if (typeof value.id !== "string") throw new Error("Invalid goal file: id must be a string");
  if (typeof value.objective !== "string") {
    throw new Error("Invalid goal file: objective must be a string");
  }
  if (!isGoalStatus(value.status)) throw new Error("Invalid goal file: status is invalid");
  if (typeof value.createdAt !== "string") {
    throw new Error("Invalid goal file: createdAt must be a string");
  }
  if (typeof value.updatedAt !== "string") {
    throw new Error("Invalid goal file: updatedAt must be a string");
  }
  if (!isNonNegativeSafeInteger(value.timeUsedSeconds)) {
    throw new Error("Invalid goal file: timeUsedSeconds must be a non-negative safe integer");
  }
  const tokenBudget = validateTokenBudget(value.tokenBudget);

  const goal: Goal = {
    id: value.id,
    objective: value.objective,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    tokenUsage: validateTokenUsage(value.tokenUsage),
    timeUsedSeconds: value.timeUsedSeconds,
  };
  if (tokenBudget !== undefined) goal.tokenBudget = tokenBudget;
  const completedAt = validateOptionalString(value.completedAt, "completedAt");
  if (completedAt !== undefined) {
    if (goal.status !== "complete") {
      throw new Error("Invalid goal file: completedAt is only valid for complete goals");
    }
    goal.completedAt = completedAt;
  }
  const lastAccountedAssistantMessageID = validateOptionalString(
    value.lastAccountedAssistantMessageID,
    "lastAccountedAssistantMessageID",
  );
  if (lastAccountedAssistantMessageID !== undefined) {
    goal.lastAccountedAssistantMessageID = lastAccountedAssistantMessageID;
  }
  const budgetLimitPromptSentAt = validateOptionalString(
    value.budgetLimitPromptSentAt,
    "budgetLimitPromptSentAt",
  );
  if (budgetLimitPromptSentAt !== undefined) {
    goal.budgetLimitPromptSentAt = budgetLimitPromptSentAt;
  }

  return goal;
}

function parseGoalFile(raw: string): GoalFile {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.version !== VERSION) return { version: VERSION };
  if (parsed.goal === undefined) return { version: VERSION };
  return { version: VERSION, goal: validateGoal(parsed.goal) };
}

export async function readGoal(ref: GoalStoreRef): Promise<Goal | undefined> {
  try {
    const file = parseGoalFile(await readFile(goalFilePath(ref), "utf8"));
    return file.goal;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeGoalFile(ref: GoalStoreRef, file: GoalFile): Promise<void> {
  const path = goalFilePath(ref);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function writeGoal(ref: GoalStoreRef, goal: Goal): Promise<Goal> {
  await writeGoalFile(ref, { version: VERSION, goal });
  return goal;
}

export async function createGoal(
  ref: GoalStoreRef,
  objective: string,
  tokenBudget?: number | null,
): Promise<Goal> {
  if (await readGoal(ref)) throw new Error("Goal already exists");
  const budget = validateTokenBudget(tokenBudget);
  const goal = newGoal(validateObjective(objective), budget);
  return writeGoal(ref, goal);
}

export async function updateGoal(ref: GoalStoreRef, update: GoalUpdate): Promise<Goal> {
  const existing = await readGoal(ref);
  if (!existing) throw new Error("No goal exists");

  const timestamp = now();
  if (update.objective !== undefined) {
    const objective = validateObjective(update.objective);
    if (objective === existing.objective) {
      const next: Goal = { ...existing, status: "active", updatedAt: timestamp };
      delete next.completedAt;
      if (update.tokenBudget !== undefined) {
        const budget = validateTokenBudget(update.tokenBudget);
        if (budget === undefined) delete next.tokenBudget;
        else next.tokenBudget = budget;
      }
      return writeGoal(ref, next);
    }
    return writeGoal(ref, newGoal(objective, validateTokenBudget(update.tokenBudget)));
  }

  const next: Goal = { ...existing, updatedAt: timestamp };
  if (update.tokenBudget !== undefined) {
    const budget = validateTokenBudget(update.tokenBudget);
    if (budget === undefined) delete next.tokenBudget;
    else next.tokenBudget = budget;
  }
  if (update.status !== undefined) {
    next.status = update.status;
    if (update.status === "complete") next.completedAt = timestamp;
    else delete next.completedAt;
  }

  return writeGoal(ref, next);
}

export async function clearGoal(ref: GoalStoreRef): Promise<void> {
  await writeGoalFile(ref, { version: VERSION });
}

export async function accountGoalUsage(
  ref: GoalStoreRef,
  usage: Pick<TokenUsageSnapshot, "input" | "output">,
  elapsedSeconds: number,
  assistantMessageID?: string,
): Promise<Goal> {
  const existing = await readGoal(ref);
  if (!existing) throw new Error("No goal exists");
  if (
    assistantMessageID !== undefined &&
    assistantMessageID === existing.lastAccountedAssistantMessageID
  ) {
    return existing;
  }
  if (!isNonNegativeSafeInteger(usage.input) || !isNonNegativeSafeInteger(usage.output)) {
    throw new Error("Goal token accounting values must be non-negative safe integers");
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Goal elapsedSeconds must be finite non-negative seconds");
  }

  const input = existing.tokenUsage.input + usage.input;
  const output = existing.tokenUsage.output + usage.output;
  const total = input + output;
  const next: Goal = {
    ...existing,
    updatedAt: now(),
    tokenUsage: { input, output, total },
    timeUsedSeconds: existing.timeUsedSeconds + Math.trunc(elapsedSeconds),
  };
  if (assistantMessageID !== undefined) next.lastAccountedAssistantMessageID = assistantMessageID;

  if (next.status === "active" && next.tokenBudget !== undefined && total >= next.tokenBudget) {
    next.status = "budgetLimited";
  }

  return writeGoal(ref, next);
}
