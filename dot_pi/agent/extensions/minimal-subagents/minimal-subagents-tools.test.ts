import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoordinatorToolSchemas } from "./minimal-subagents-tool-schemas.js";
import { createCoordinatorToolDefinitions } from "./minimal-subagents-tools.js";

describe("createCoordinatorToolDefinitions", () => {
  afterEach(() => vi.useRealTimers());
  it("returns exactly the six confirmed root-callable tools", () => {
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
      "agent_message",
      "subagent_wait",
      "subagent_status",
      "subagent_cancel",
      "subagent_delete",
    ]);
    expect(tools.every((tool) => tool.renderCall && tool.renderResult)).toBe(true);
  });

  it("attaches the resolved launch contract to spawn rendering details", async () => {
    const coordinator = {
      spawn: vi.fn(async () => ({
        agent_id: "root.worker",
        turn_id: "turn-1",
        status: "running",
      })),
      inspectStatus: vi.fn(() => ({
        agent: {
          agent_id: "root.worker",
          launch_contract: { ordinary_tools: ["read", "bash"] },
        },
      })),
    };
    const tools = createCoordinatorToolDefinitions({
      coordinator: coordinator as never,
      callerId: "root",
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => ({}) as never,
    });
    const spawnTool = tools.find((tool) => tool.name === "subagent")!;
    const result = await spawnTool.execute(
      "call-1",
      { task: "Review" },
      undefined,
      undefined,
      {} as never,
    );
    expect(result.details).toEqual(
      expect.objectContaining({
        agent: expect.objectContaining({
          launch_contract: expect.objectContaining({ ordinary_tools: ["read", "bash"] }),
        }),
      }),
    );
  });

  it("clears the wait progress timer after the exact turn settles", async () => {
    vi.useFakeTimers();
    let settleWait!: (result: unknown) => void;
    const wait = vi.fn(
      () =>
        new Promise((resolve) => {
          settleWait = resolve;
        }),
    );
    const tools = createCoordinatorToolDefinitions({
      coordinator: { wait } as never,
      callerId: "root",
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });
    const waitTool = tools.find((tool) => tool.name === "subagent_wait")!;
    const execution = waitTool.execute(
      "call-1",
      { agent_id: "root.worker" },
      undefined,
      vi.fn(),
      {} as never,
    );
    expect(vi.getTimerCount()).toBe(1);
    settleWait({
      agent_id: "root.worker",
      turn_id: "turn-1",
      status: "completed",
      output: "done",
    });
    await execution;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("executes one direct agent message with the bound caller identity", async () => {
    const message = vi.fn(async () => ({
      agent_id: "root.child",
      behavior: "steer",
      delivered: true,
    }));
    const tools = createCoordinatorToolDefinitions({
      coordinator: { message } as never,
      callerId: "root",
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });

    const result = await tools
      .find((tool) => tool.name === "agent_message")!
      .execute(
        "message-call",
        { agent_id: "root.child", message: "update" },
        undefined,
        undefined,
        {} as never,
      );

    expect(message).toHaveBeenCalledWith(
      "root",
      { agent_id: "root.child", message: "update", behavior: undefined },
      "root:message-call",
    );
    expect(result.details).toEqual({
      agent_id: "root.child",
      behavior: "steer",
      delivered: true,
    });
  });

  it("passes caller identity into child-scoped status", async () => {
    const status = vi.fn(() => ({ parent_id: "root.lead", agents: [] }));
    const tools = createCoordinatorToolDefinitions({
      coordinator: { status } as never,
      callerId: "root.lead",
      allowFanoutTools: true,
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });

    await tools
      .find((tool) => tool.name === "subagent_status")!
      .execute("status-call", { agent_id: "root.lead.child" }, undefined, undefined, {} as never);

    expect(status).toHaveBeenCalledWith("root.lead", "root.lead.child");
  });

  it("passes the fanout caller identity into lifecycle management", async () => {
    const cancel = vi.fn(async () => ({
      agent_id: "root.lead.child",
      recursive: false,
      affected_agent_ids: ["root.lead.child"],
      cancelled_turn_ids: [],
    }));
    const deleteAgent = vi.fn(async () => ({
      agent_id: "root.lead.child",
      recursive: false,
      deleted_agent_ids: ["root.lead.child"],
      tombstoned_agent_ids: ["root.lead.child"],
      trashed_session_files: [],
      failures: [],
    }));
    const tools = createCoordinatorToolDefinitions({
      coordinator: { cancel, delete: deleteAgent } as never,
      callerId: "root.lead",
      allowFanoutTools: true,
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });

    await tools
      .find((tool) => tool.name === "subagent_cancel")!
      .execute(
        "cancel-call",
        { agent_id: "root.lead.child", recursive: false },
        undefined,
        undefined,
        {} as never,
      );
    await tools
      .find((tool) => tool.name === "subagent_delete")!
      .execute(
        "delete-call",
        { agent_id: "root.lead.child", recursive: false },
        undefined,
        undefined,
        {} as never,
      );

    expect(cancel).toHaveBeenCalledWith("root.lead", "root.lead.child", false);
    expect(deleteAgent).toHaveBeenCalledWith("root.lead", "root.lead.child", false);
  });

  it("keeps spawn and descendant management tools for an authorized fanout child", () => {
    const tools = createCoordinatorToolDefinitions({
      coordinator: {} as never,
      callerId: "root.lead",
      allowFanoutTools: true,
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "subagent",
      "agent_message",
      "subagent_wait",
      "subagent_status",
      "subagent_cancel",
      "subagent_delete",
    ]);
  });

  it("withholds spawn and destructive management tools from an ordinary child", () => {
    const tools = createCoordinatorToolDefinitions({
      coordinator: {} as never,
      callerId: "root.reviewer",
      allowFanoutTools: false,
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "agent_message",
      "subagent_wait",
      "subagent_status",
    ]);
  });
});
