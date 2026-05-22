export type GoalCommand =
  | { type: "show" }
  | { type: "clear" }
  | { type: "setStatus"; status: "active" | "paused" }
  | { type: "setObjective"; objective: string };

export function parseGoalCommand(rawArgs: string): GoalCommand {
  const args = rawArgs.trim();
  if (!args) return { type: "show" };
  if (args === "show") return { type: "show" };
  if (args === "pause") return { type: "setStatus", status: "paused" };
  if (args === "resume") return { type: "setStatus", status: "active" };
  if (args === "clear") return { type: "clear" };
  if (args.startsWith("set ")) return { type: "setObjective", objective: args.slice(4).trim() };

  return { type: "setObjective", objective: args };
}
