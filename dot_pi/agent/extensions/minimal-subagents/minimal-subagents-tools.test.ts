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
      "subagent_message",
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
      status: vi.fn(() => ({
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

  it("withholds spawn from an ordinary child while preserving its other coordinator tools", () => {
    const tools = createCoordinatorToolDefinitions({
      coordinator: {} as never,
      callerId: "root.reviewer",
      allowSpawn: false,
      schemas: createCoordinatorToolSchemas([]),
      captureCaller: () => {
        throw new Error("not used");
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "subagent_message",
      "subagent_wait",
      "subagent_status",
      "subagent_cancel",
      "subagent_delete",
    ]);
  });
});
