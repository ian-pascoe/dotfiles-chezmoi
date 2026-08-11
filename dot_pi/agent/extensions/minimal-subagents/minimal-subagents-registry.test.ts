import { describe, expect, it } from "vitest";
import { createRegistryEvent, replayRegistryEntries } from "./minimal-subagents-registry.js";
import type { PersistedAgent, RegistrySnapshot, TurnResult } from "./minimal-subagents-types.js";

function agent(agentId: string, parentId = "root"): PersistedAgent {
  return {
    agent_id: agentId,
    friendly_id: agentId.split(".").at(-1)!,
    parent_id: parentId,
    created_at: "2026-08-11T00:00:00.000Z",
    spawn_entry_id: "spawn-entry",
    session_file: `/sessions/${agentId}.jsonl`,
    session_id: `session-${agentId}`,
    launch_contract: {
      session_context: "inherit",
      project_context: "inherit",
      model: "openai/gpt",
      thinking_level: "high",
      tools: undefined,
      ordinary_tools: ["read"],
    },
    capability_ceiling: ["read"],
    availability: "available",
    missing_dependencies: [],
    recent_messages: [],
  };
}

const rootSessionId = "root-session";
const emptySnapshot: RegistrySnapshot = { agents: [], tombstones: [], deliveries: [] };

function entry(event: unknown) {
  return { type: "custom", customType: "minimal-subagents.registry", data: event };
}

describe("replayRegistryEntries", () => {
  it("starts at the latest matching checkpoint across the whole root file", () => {
    const staleAgent = agent("root.stale");
    const liveAgent = agent("root.live");
    const entries = [
      entry(createRegistryEvent(rootSessionId, "checkpoint", { snapshot: emptySnapshot })),
      entry(createRegistryEvent(rootSessionId, "agent-created", { agent: staleAgent })),
      entry({ version: 1, root_session_id: "another-root", timestamp: "x", event: "checkpoint" }),
      entry(
        createRegistryEvent(rootSessionId, "checkpoint", {
          snapshot: { ...emptySnapshot, agents: [liveAgent] },
        }),
      ),
    ];

    expect(
      replayRegistryEntries(entries, rootSessionId).agents.map((item) => item.agent_id),
    ).toEqual(["root.live"]);
  });

  it("reconstructs turns, deliveries, and durable deletion tombstones", () => {
    const created = agent("root.worker");
    const result: TurnResult = {
      agent_id: created.agent_id,
      turn_id: "turn-1",
      status: "completed",
      output: "done",
    };
    const entries = [
      entry(createRegistryEvent(rootSessionId, "checkpoint", { snapshot: emptySnapshot })),
      entry(createRegistryEvent(rootSessionId, "agent-created", { agent: created })),
      entry(
        createRegistryEvent(rootSessionId, "turn-started", {
          agent_id: created.agent_id,
          turn_id: "turn-1",
          started_at: "2026-08-11T00:00:01.000Z",
        }),
      ),
      entry(createRegistryEvent(rootSessionId, "turn-settled", { result })),
      entry(
        createRegistryEvent(rootSessionId, "delivery-pending", {
          delivery: {
            source_agent_id: created.agent_id,
            source_turn_id: "turn-1",
            destination_agent_id: "root",
            path: "message",
            settled: false,
          },
        }),
      ),
      entry(
        createRegistryEvent(rootSessionId, "delivery-settled", {
          source_agent_id: created.agent_id,
          source_turn_id: "turn-1",
        }),
      ),
      entry(
        createRegistryEvent(rootSessionId, "agent-deleted", {
          agent_ids: [created.agent_id],
        }),
      ),
    ];

    const replay = replayRegistryEntries(entries, rootSessionId);
    expect(replay.agents).toEqual([]);
    expect(replay.tombstones).toEqual([created.agent_id]);
    expect(replay.deliveries).toEqual([
      expect.objectContaining({ source_turn_id: "turn-1", settled: true }),
    ]);
  });

  it("ignores malformed and foreign-root registry entries", () => {
    expect(
      replayRegistryEntries(
        [
          entry({ nope: true }),
          entry(createRegistryEvent("other", "agent-created", { agent: agent("root.foreign") })),
        ],
        rootSessionId,
      ),
    ).toEqual(emptySnapshot);
  });
});
