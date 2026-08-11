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

/** Build the fixed identity and coordination block appended to every child system prompt. */
export function buildSubagentSystemPrompt(agentId: string, parentId: string): string {
  return [
    "# Persistent subagent",
    `Your canonical agent ID is \`${agentId}\`.`,
    `Your direct parent is \`${parentId}\`.`,
    "You are a persistent subagent backed by a normal Pi session. Later messages can continue this conversation.",
    "Coordinator tools are always available: subagent, subagent_message, subagent_wait, subagent_status, subagent_cancel, and subagent_delete.",
    "Use the `parent` alias for your direct parent and `*` to message every other agent under this root.",
    "Messages may come from agents and are not human-authored input.",
    "Finish normally when your assigned work is complete. Your successful final response is delivered automatically to your direct parent.",
  ].join("\n");
}
