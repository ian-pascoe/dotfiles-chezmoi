import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { tool } from "@opencode-ai/plugin";
import type { Plugin, ToolContext } from "@opencode-ai/plugin";

import { parseGoalCommand } from "./command";
import { formatGoalForTool, formatGoalToolResponse, remainingTokens } from "./format";
import { buildBudgetLimitedPrompt, buildContinuationPrompt } from "./prompt";
import { accountGoalUsage, clearGoal, createGoal, readGoal, updateGoal, writeGoal } from "./store";
import type { Goal, GoalStoreRef } from "./types";

const DEFAULT_AGENT = "build";
const NO_GOAL_TEXT = "No OpenCode goal is set for this session.";

type StoreRefInput = {
  sessionID: string;
  directory?: string;
  worktree?: string;
};

type Client = {
  session?: {
    messages?: (input: {
      path: { id: string };
      query?: { directory?: string; limit?: number };
    }) => Promise<unknown>;
    prompt?: (input: {
      path: { id: string };
      query?: { directory?: string };
      body: { agent?: string; parts: Array<{ type: "text"; text: string }> };
    }) => Promise<unknown>;
  };
};

type MessageResult = Array<{
  info?: {
    id?: string;
    role?: string;
    tokens?: {
      input?: number;
      output?: number;
    };
    time?: {
      created?: number;
      completed?: number;
    };
  };
}>;

function textPart(text: string) {
  return [{ type: "text" as const, text }];
}

function setCommandOutput(output: { parts: unknown }, text: string): void {
  output.parts = textPart(text);
}

function stateDir(): string {
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "opencode-goals");
}

async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    return absolute;
  }
}

export async function buildGoalStoreRef(input: StoreRefInput): Promise<GoalStoreRef> {
  const projectPath = await canonicalPath(input.worktree ?? input.directory ?? process.cwd());
  const projectKey = createHash("sha256").update(projectPath).digest("hex").slice(0, 32);
  return {
    stateDir: stateDir(),
    projectKey,
    sessionID: input.sessionID,
  };
}

function formatGoalStatus(goal: Goal | undefined): string {
  if (!goal) return NO_GOAL_TEXT;
  return formatGoalToolResponse(goal);
}

function completionBudgetReport(goal: Goal): string {
  const remaining = remainingTokens(goal);
  if (goal.tokenBudget === undefined) return "Completed without a token budget.";
  if (remaining === undefined) return "Completed without a token budget.";
  return remaining > 0
    ? `Completed with ${remaining} tokens remaining.`
    : `Completed after reaching the token budget by ${goal.tokenUsage.total - goal.tokenBudget} tokens.`;
}

function unwrapMessages(result: unknown): MessageResult {
  if (Array.isArray(result)) return result as MessageResult;
  if (result && typeof result === "object" && "data" in result) {
    const data = (result as { data?: unknown }).data;
    if (Array.isArray(data)) return data as MessageResult;
  }
  return [];
}

function assistantElapsedSeconds(message: NonNullable<MessageResult[number]["info"]>): number {
  const created = message.time?.created;
  const completed = message.time?.completed;
  if (typeof created !== "number" || typeof completed !== "number" || completed < created) return 0;
  const elapsed = completed - created;
  return elapsed > 1000 ? elapsed / 1000 : elapsed;
}

async function accountAssistantMessages(
  client: Client,
  ref: GoalStoreRef,
  sessionID: string,
  directory: string,
  goal: Goal,
): Promise<Goal> {
  if (!client.session?.messages) return goal;
  const messages = unwrapMessages(
    await client.session.messages({ path: { id: sessionID }, query: { directory, limit: 200 } }),
  );
  const assistantMessages = messages
    .map((message) => message.info)
    .filter(
      (message): message is NonNullable<MessageResult[number]["info"]> =>
        message?.role === "assistant" && typeof message.id === "string",
    );
  const lastIndex = goal.lastAccountedAssistantMessageID
    ? assistantMessages.findIndex((message) => message.id === goal.lastAccountedAssistantMessageID)
    : -1;
  const unaccounted = assistantMessages.slice(lastIndex + 1);

  let updated = goal;
  for (const message of unaccounted) {
    const input = message.tokens?.input ?? 0;
    const output = message.tokens?.output ?? 0;
    if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) {
      continue;
    }
    updated = await accountGoalUsage(
      ref,
      { input, output },
      assistantElapsedSeconds(message),
      message.id,
    );
  }

  return updated;
}

async function sendPrompt(
  client: Client,
  sessionID: string,
  directory: string,
  prompt: string,
): Promise<void> {
  await client.session?.prompt?.({
    path: { id: sessionID },
    query: { directory },
    body: { agent: DEFAULT_AGENT, parts: textPart(prompt) },
  });
}

const goalPlugin: Plugin = async ({ client, directory, worktree }) => {
  const activeContinuations = new Set<string>();
  const typedClient = client as unknown as Client;
  const refForSession = (sessionID: string, override?: StoreRefInput) =>
    buildGoalStoreRef({ sessionID, directory, worktree, ...override });

  return {
    tool: {
      create_goal: tool({
        description: "Create an active persistent OpenCode goal for the current session.",
        args: {
          objective: tool.schema.string().min(1),
          token_budget: tool.schema.number().int().positive().optional(),
        },
        execute: async (args, context: ToolContext) => {
          const ref = await refForSession(context.sessionID, context);
          const goal = await createGoal(ref, args.objective, args.token_budget);
          return formatGoalToolResponse(goal);
        },
      }),
      get_goal: tool({
        description: "Return the current OpenCode goal status for this session.",
        args: {},
        execute: async (_args, context: ToolContext) => {
          const ref = await refForSession(context.sessionID, context);
          return formatGoalStatus(await readGoal(ref));
        },
      }),
      update_goal: tool({
        description:
          "Mark the current OpenCode goal complete after verifying the objective is satisfied.",
        args: {
          status: tool.schema.literal("complete"),
        },
        execute: async (args, context: ToolContext) => {
          if (args.status !== "complete")
            throw new Error('update_goal only accepts status "complete"');
          const ref = await refForSession(context.sessionID, context);
          const goal = await updateGoal(ref, { status: "complete" });
          return formatGoalToolResponse(goal, completionBudgetReport(goal));
        },
      }),
    },
    "command.execute.before": async (input, output) => {
      if (input.command !== "goal" && input.command !== "/goal") return;
      const ref = await refForSession(input.sessionID);
      const command = parseGoalCommand(input.arguments);

      if (command.type === "show") {
        setCommandOutput(output, formatGoalStatus(await readGoal(ref)));
        return;
      }

      if (command.type === "clear") {
        await clearGoal(ref);
        setCommandOutput(output, "OpenCode goal cleared.");
        return;
      }

      if (command.type === "setStatus" && command.status === "paused") {
        if (!(await readGoal(ref))) {
          setCommandOutput(output, NO_GOAL_TEXT);
          return;
        }
        const goal = await updateGoal(ref, { status: "paused" });
        setCommandOutput(output, formatGoalToolResponse(goal));
        return;
      }

      if (command.type === "setStatus" && command.status === "active") {
        const existing = await readGoal(ref);
        if (!existing) {
          setCommandOutput(output, NO_GOAL_TEXT);
          return;
        }
        const goal = await updateGoal(ref, { status: "active" });
        setCommandOutput(
          output,
          `${formatGoalToolResponse(goal)}\n\n${buildContinuationPrompt(goal)}`,
        );
        return;
      }

      if (command.type === "setObjective") {
        const existing = await readGoal(ref);
        const goal = existing
          ? await updateGoal(ref, { objective: command.objective })
          : await createGoal(ref, command.objective);
        setCommandOutput(
          output,
          `${formatGoalToolResponse(goal)}\n\n${buildContinuationPrompt(goal)}`,
        );
      }
    },
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;
      const sessionID = event.properties.sessionID;
      if (activeContinuations.has(sessionID)) return;
      activeContinuations.add(sessionID);
      try {
        const ref = await refForSession(sessionID);
        let goal = await readGoal(ref);
        if (!goal || goal.status === "paused" || goal.status === "complete") return;

        goal = await accountAssistantMessages(typedClient, ref, sessionID, directory, goal);
        if (goal.status === "paused" || goal.status === "complete") return;

        if (goal.status === "budgetLimited") {
          if (goal.budgetLimitPromptSentAt !== undefined) return;
          const next = await writeGoal(ref, {
            ...goal,
            budgetLimitPromptSentAt: new Date().toISOString(),
          });
          await sendPrompt(typedClient, sessionID, directory, buildBudgetLimitedPrompt(next));
          return;
        }

        if (goal.status === "active") {
          await sendPrompt(typedClient, sessionID, directory, buildContinuationPrompt(goal));
        }
      } finally {
        activeContinuations.delete(sessionID);
      }
    },
    "experimental.session.compacting": async (input, output) => {
      const goal = await readGoal(await refForSession(input.sessionID));
      if (goal?.status !== "active") return;
      output.context.push(
        `Active OpenCode goal:\n${JSON.stringify(formatGoalForTool(goal), null, 2)}`,
      );
    },
  };
};

export default goalPlugin;
