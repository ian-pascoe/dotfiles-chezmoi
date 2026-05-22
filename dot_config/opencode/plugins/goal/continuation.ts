import type { Goal } from "./types";

export function shouldQueueGoalContinuationWhenIdle(
  goal: Goal | undefined,
  isIdle: boolean,
  hasPendingMessages: boolean,
): boolean {
  return goal?.status === "active" && isIdle && !hasPendingMessages;
}

export function shouldQueueGoalContinuationAfterAgentEnd(
  goal: Goal | undefined,
  hasPendingMessages: boolean,
): boolean {
  return goal?.status === "active" && !hasPendingMessages;
}
