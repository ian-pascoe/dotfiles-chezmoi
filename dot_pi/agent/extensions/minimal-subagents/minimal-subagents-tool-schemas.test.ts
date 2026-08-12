import { describe, expect, it } from "vitest";
import { createCoordinatorToolSchemas } from "./minimal-subagents-tool-schemas.js";

describe("createCoordinatorToolSchemas", () => {
  it("publishes only eligible canonical models and exactly the six public parameter shapes", () => {
    const schemas = createCoordinatorToolSchemas(["openai/gpt", "anthropic/claude"]);
    expect(Object.keys(schemas)).toEqual([
      "subagent",
      "agent_message",
      "subagent_wait",
      "subagent_status",
      "subagent_cancel",
      "subagent_delete",
    ]);
    expect(schemas.subagent.properties.model).toEqual(
      expect.objectContaining({ enum: ["openai/gpt", "anthropic/claude"] }),
    );
    expect(Object.keys(schemas.subagent.properties)).toEqual([
      "task",
      "agent_id",
      "session_context",
      "project_context",
      "model",
      "thinking_level",
      "tools",
      "delegation",
    ]);
    expect(schemas.subagent.properties.delegation).toEqual(
      expect.objectContaining({ enum: ["none", "fanout"] }),
    );
    expect(Object.keys(schemas.agent_message.properties)).toEqual(["agent_id", "message"]);
    const messageTargetPattern = (schemas.agent_message.properties.agent_id as { pattern?: string })
      .pattern;
    expect(messageTargetPattern).toBeDefined();
    const acceptsMessageTarget = (target: string) => new RegExp(messageTargetPattern!).test(target);
    expect(acceptsMessageTarget("*")).toBe(false);
    expect(acceptsMessageTarget("peer*")).toBe(false);
    expect(acceptsMessageTarget("a/b")).toBe(false);
    expect(acceptsMessageTarget(" ")).toBe(false);
    expect(acceptsMessageTarget("parent")).toBe(true);
    expect(acceptsMessageTarget("lead.reviewer")).toBe(true);
    expect(acceptsMessageTarget("root.legacy")).toBe(true);
  });

  it("makes explicit model selection impossible for an empty model set", () => {
    const schema = createCoordinatorToolSchemas([]).subagent;
    expect(schema.properties.model).toEqual(expect.objectContaining({ not: {} }));
  });
});
