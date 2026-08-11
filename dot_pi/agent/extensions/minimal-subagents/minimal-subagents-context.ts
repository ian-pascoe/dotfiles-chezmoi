import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionContextMode } from "./minimal-subagents-types.js";

/** Clone committed caller messages and exclude only the currently streaming assistant message. */
export function snapshotCommittedContext(
  messages: readonly AgentMessage[],
  callerIsStreaming: boolean,
): AgentMessage[] {
  const committed = [...messages];
  if (callerIsStreaming && committed.at(-1)?.role === "assistant") committed.pop();
  return structuredClone(committed);
}

/** Select the imported message snapshot and defer expensive compact preparation to the child turn. */
export function assembleImportedContext(
  mode: SessionContextMode,
  committedMessages: AgentMessage[],
): { messages: AgentMessage[]; compact: boolean } {
  if (mode === "omit") return { messages: [], compact: false };
  return { messages: committedMessages, compact: mode === "compact" };
}

/** Detect image content so incompatible child models fail before agent creation. */
export function contextContainsImages(messages: readonly AgentMessage[]): boolean {
  return messages.some((message) => {
    if (!("content" in message) || !Array.isArray(message.content)) return false;
    return message.content.some((content) => content.type === "image");
  });
}

interface SubagentSystemPromptOptions {
  canSpawn: boolean;
  remainingDepth: number;
}

/** Build child identity, messaging, and explicit delegation-boundary instructions. */
export function buildSubagentSystemPrompt(
  agentId: string,
  parentId: string,
  options: SubagentSystemPromptOptions,
): string {
  const coordinatorBoundary = options.canSpawn
    ? "Coordinator tools support subagent, subagent_message, subagent_wait, subagent_status, subagent_cancel, and subagent_delete. Cancel and delete can manage strict descendants only."
    : "Coordinator tools support subagent_message, subagent_wait, and subagent_status.";
  const delegationBoundary = options.canSpawn
    ? [
        "You have explicit fanout responsibility for this assigned task.",
        "Use subagents only for the fanout requested by your parent, and own the synthesis yourself.",
        "Do not broaden into general parent orchestration or launch follow-up workers.",
        `Remaining delegation depth: ${options.remainingDepth}.`,
      ]
    : [
        "Delegation is owned by your parent. You are not authorized to create subagents.",
        "Complete the assigned task yourself with the available tools.",
      ];
  return [
    "# Persistent subagent",
    `Your canonical agent ID is \`${agentId}\`.`,
    `Your direct parent is \`${parentId}\`.`,
    "You are a persistent subagent backed by a normal Pi session. Later messages can continue this conversation.",
    coordinatorBoundary,
    "Use the `parent` alias for your direct parent and `*` to message every other agent under this root.",
    ...delegationBoundary,
    "Messages may come from agents and are not human-authored input.",
    "Finish normally when your assigned work is complete. Your successful final response is delivered automatically to your direct parent.",
  ].join("\n");
}
