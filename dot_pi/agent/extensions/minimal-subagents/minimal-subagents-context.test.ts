import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  assembleImportedContext,
  buildSubagentSystemPrompt,
  contextContainsImages,
  snapshotCommittedContext,
} from "./minimal-subagents-context.js";

const userMessage: AgentMessage = {
  role: "user",
  content: [{ type: "text", text: "task" }],
  timestamp: 1,
};
const committedAssistant: AgentMessage = {
  role: "assistant",
  content: [{ type: "text", text: "answer" }],
  api: "openai-responses",
  provider: "openai",
  model: "gpt",
  stopReason: "stop",
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  timestamp: 2,
};
const streamingAssistant: AgentMessage = {
  ...committedAssistant,
  content: [{ type: "toolCall", id: "spawn", name: "subagent", arguments: { task: "child" } }],
  stopReason: "toolUse",
  timestamp: 3,
};

describe("snapshotCommittedContext", () => {
  it("copies the immediate caller snapshot without the current streaming assistant", () => {
    const source = [userMessage, committedAssistant, userMessage, streamingAssistant];
    const snapshot = snapshotCommittedContext(source, true);
    expect(snapshot).toEqual([userMessage, committedAssistant, userMessage]);
    expect(snapshot).not.toBe(source);
    expect(snapshot[0]).not.toBe(source[0]);
  });

  it("preserves a terminal assistant when the caller is idle", () => {
    expect(snapshotCommittedContext([userMessage, committedAssistant], false)).toEqual([
      userMessage,
      committedAssistant,
    ]);
  });
});

describe("assembleImportedContext", () => {
  it("uses the same snapshot for inherit and compact but marks compact setup", () => {
    const messages = [userMessage, committedAssistant];
    expect(assembleImportedContext("inherit", messages)).toEqual({ messages, compact: false });
    expect(assembleImportedContext("compact", messages)).toEqual({ messages, compact: true });
  });

  it("omits all caller conversation while leaving task prompting to the runtime", () => {
    expect(assembleImportedContext("omit", [userMessage])).toEqual({
      messages: [],
      compact: false,
    });
  });
});

describe("contextContainsImages", () => {
  it("detects images without discarding their content", () => {
    const imageMessage: AgentMessage = {
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "image", data: "base64", mimeType: "image/png" },
      ],
      timestamp: 1,
    };
    expect(contextContainsImages([imageMessage])).toBe(true);
    expect(contextContainsImages([userMessage])).toBe(false);
  });
});

describe("buildSubagentSystemPrompt", () => {
  it("contains identity, aliases, tools, persistence, and completion behavior", () => {
    const prompt = buildSubagentSystemPrompt("root.research.sources", "root.research");
    expect(prompt).toContain("root.research.sources");
    expect(prompt).toContain("root.research");
    expect(prompt).toContain("parent");
    expect(prompt).toContain("*");
    expect(prompt).toContain("persistent subagent");
    expect(prompt).toContain("subagent_wait");
    expect(prompt).toContain("final response is delivered");
  });
});
