const MAX_OBJECTIVE_LENGTH = 4000;

export function validateObjective(objective: unknown): string {
  if (typeof objective !== "string") {
    throw new Error("Goal objective must be a string");
  }

  const trimmed = objective.trim();
  if (!trimmed) {
    throw new Error("Goal objective cannot be empty");
  }
  if (trimmed.length > MAX_OBJECTIVE_LENGTH) {
    throw new Error(
      "Goal objective is too long; put detailed instructions in a file and reference it",
    );
  }

  return trimmed;
}

export function validateTokenBudget(tokenBudget: unknown): number | undefined {
  if (tokenBudget === undefined || tokenBudget === null) return undefined;
  if (typeof tokenBudget !== "number") {
    throw new Error("Goal token budget must be a positive safe integer");
  }
  if (!Number.isSafeInteger(tokenBudget) || tokenBudget <= 0) {
    throw new Error("Goal token budget must be a positive safe integer");
  }

  return tokenBudget;
}
