import { describe, expect, it } from "vitest";
import { createCoordinatorToolSchemas } from "./minimal-subagents-tool-schemas.js";
import { createCoordinatorToolDefinitions } from "./minimal-subagents-tools.js";

describe("createCoordinatorToolDefinitions", () => {
  it("returns exactly the six confirmed LLM-callable tools", () => {
    const coordinator = {} as never;
    const tools = createCoordinatorToolDefinitions({
      coordinator,
      callerId: "root",
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "subagent",
      "subagent_message",
      "subagent_wait",
      "subagent_status",
      "subagent_cancel",
      "subagent_delete",
    ]);
  });
});
