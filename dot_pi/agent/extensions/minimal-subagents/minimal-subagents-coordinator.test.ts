import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { MinimalSubagentsCoordinator } from "./minimal-subagents-coordinator.js";
import type {
  AgentSessionFactory,
  CallerSnapshot,
  ChildAgentRuntime,
  CoordinatorMessage,
  PersistedAgent,
  RegistryWriter,
  RootConversationEndpoint,
  RuntimeCreationRequest,
  RuntimeTurnOutcome,
} from "./minimal-subagents-types.js";

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

class DeferredOutcome {
  promise: Promise<RuntimeTurnOutcome>;
  resolve!: (outcome: RuntimeTurnOutcome) => void;

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}

class FakeRuntime implements ChildAgentRuntime {
  readonly queued: Array<{ message: CoordinatorMessage; behavior: string }> = [];
  readonly messages: CoordinatorMessage[] = [];
  readonly promptOutcomes: DeferredOutcome[] = [];
  readonly messageOutcomes: DeferredOutcome[] = [];
  readonly evidence = new Set<string>();
  isRunning = false;
  disposed = false;
  aborted = false;

  constructor(
    readonly sessionFile: string,
    readonly sessionId: string,
    readonly transcript: AgentMessage[] = [],
  ) {}

  runPrompt(): Promise<RuntimeTurnOutcome> {
    this.isRunning = true;
    const deferred = new DeferredOutcome();
    this.promptOutcomes.push(deferred);
    return deferred.promise.finally(() => {
      this.isRunning = false;
    });
  }

  runMessage(message: CoordinatorMessage): Promise<RuntimeTurnOutcome> {
    this.messages.push(message);
    this.isRunning = true;
    const deferred = new DeferredOutcome();
    this.messageOutcomes.push(deferred);
    return deferred.promise.finally(() => {
      this.isRunning = false;
    });
  }

  async queueMessage(message: CoordinatorMessage, behavior: "steer" | "follow-up"): Promise<void> {
    this.queued.push({ message, behavior });
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.isRunning = false;
    for (const outcome of [...this.promptOutcomes, ...this.messageOutcomes]) {
      outcome.resolve({ status: "cancelled", output: "" });
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  snapshotCommittedMessages(): AgentMessage[] {
    return structuredClone(this.transcript);
  }

  hasDeliveryEvidence(sourceAgentId: string, sourceTurnId: string): boolean {
    return this.evidence.has(`${sourceAgentId}:${sourceTurnId}`);
  }

  getUsage(): Usage {
    return ZERO_USAGE;
  }

  async cloneSession(): Promise<{ sessionFile: string; sessionId: string }> {
    return { sessionFile: `${this.sessionFile}.clone`, sessionId: `${this.sessionId}.clone` };
  }
}

class FakeSessionFactory implements AgentSessionFactory {
  readonly runtimes = new Map<string, FakeRuntime>();
  readonly trashOrder: string[] = [];
  readonly cloneFailures = new Set<string>();
  holdRuntimeCreation = false;
  releaseRuntimeCreation?: () => void;

  createIdentity(agent: PersistedAgent) {
    return {
      sessionFile: `/sessions/${agent.agent_id}.jsonl`,
      sessionId: `session-${agent.agent_id}`,
    };
  }

  async createRuntime(request: RuntimeCreationRequest): Promise<ChildAgentRuntime> {
    if (this.holdRuntimeCreation) {
      await new Promise<void>((resolve) => {
        this.releaseRuntimeCreation = resolve;
      });
    }
    return this.makeRuntime(request.agent);
  }

  async restoreRuntime(agent: PersistedAgent): Promise<ChildAgentRuntime> {
    return this.makeRuntime(agent);
  }

  async resolveLaunchMissingDependencies(agent: PersistedAgent): Promise<string[]> {
    return agent.launch_contract.model.includes("missing") ? [agent.launch_contract.model] : [];
  }

  resolveRestorationMissingDependencies(agent: PersistedAgent): Promise<string[]> {
    return this.resolveLaunchMissingDependencies(agent);
  }

  resolveThinkingLevel(
    _modelId: string,
    requested: PersistedAgent["launch_contract"]["thinking_level"],
  ) {
    return requested === "max" ? ("high" as const) : requested;
  }

  modelSupportsImages(modelId: string): boolean {
    return !modelId.includes("text-only");
  }

  async cloneSession(agent: PersistedAgent) {
    if (this.cloneFailures.has(agent.agent_id)) {
      throw new Error(`clone failed for ${agent.agent_id}`);
    }
    return {
      sessionFile: `${agent.session_file}.clone`,
      sessionId: `${agent.session_id}.clone`,
    };
  }

  async trashSessionFile(sessionFile: string): Promise<void> {
    this.trashOrder.push(sessionFile);
  }

  private makeRuntime(agent: PersistedAgent): FakeRuntime {
    const runtime = new FakeRuntime(agent.session_file!, agent.session_id!);
    if (this.cloneFailures.has(agent.agent_id)) {
      runtime.cloneSession = async () => {
        throw new Error(`clone failed for ${agent.agent_id}`);
      };
    }
    this.runtimes.set(agent.agent_id, runtime);
    return runtime;
  }
}

class FakeRoot implements RootConversationEndpoint {
  running = false;
  readonly messages: Array<{ message: CoordinatorMessage; behavior: string }> = [];
  readonly evidence = new Set<string>();

  isRunning(): boolean {
    return this.running;
  }

  async deliverMessage(
    message: CoordinatorMessage,
    behavior: "steer" | "follow-up",
  ): Promise<void> {
    this.messages.push({ message, behavior });
  }

  hasDeliveryEvidence(sourceAgentId: string, sourceTurnId: string): boolean {
    return this.evidence.has(`${sourceAgentId}:${sourceTurnId}`);
  }
}

class FakeRegistry implements RegistryWriter {
  rootSessionId = "root-session";
  readonly events: unknown[] = [];
  append(event: unknown): void {
    this.events.push(event);
  }
}

function rootCaller(overrides: Partial<CallerSnapshot> = {}): CallerSnapshot {
  return {
    messages: [],
    model: "openai/gpt",
    thinkingLevel: "high",
    ordinaryTools: ["read", "bash"],
    capabilityCeiling: ["read", "grep", "find", "ls", "bash", "edit", "write"],
    availableTools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
    spawnEntryId: "root-entry",
    ...overrides,
  };
}

function makeCoordinator(automaticDeliveryGraceMs = 0, now?: () => Date, maxSubagentDepth = 2) {
  const sessions = new FakeSessionFactory();
  const root = new FakeRoot();
  const registry = new FakeRegistry();
  const notify = vi.fn();
  const coordinator = new MinimalSubagentsCoordinator({
    sessions,
    root,
    registry,
    notify,
    now,
    automaticDeliveryGraceMs,
    maxSubagentDepth,
  });
  return { coordinator, sessions, root, registry, notify };
}

async function flushTasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MinimalSubagentsCoordinator spawning", () => {
  it("returns a persisted running identity before expensive runtime setup", async () => {
    const { coordinator, sessions } = makeCoordinator();
    sessions.holdRuntimeCreation = true;

    const result = await coordinator.spawn(
      "root",
      { task: "work", thinking_level: "max" },
      rootCaller(),
    );

    expect(result).toEqual({
      agent_id: "agent-1",
      turn_id: expect.any(String),
      status: "running",
    });
    expect(coordinator.inspectStatus("agent-1")).toEqual({
      agent: expect.objectContaining({
        state: "running",
        session_file: "/sessions/agent-1.jsonl",
        thinking_level: "high",
      }),
    });
    expect(sessions.runtimes.size).toBe(0);
    sessions.releaseRuntimeCreation?.();
  });

  it("generates unique root-child IDs without a root prefix", async () => {
    const { coordinator } = makeCoordinator();

    const first = await coordinator.spawn("root", { task: "first" }, rootCaller());
    const second = await coordinator.spawn("root", { task: "second" }, rootCaller());

    expect(first.agent_id).toBe("agent-1");
    expect(second.agent_id).toBe("agent-2");
  });

  it("keeps the root prefix within registries restored from the legacy ID format", async () => {
    const original = makeCoordinator();
    await original.coordinator.spawn(
      "root",
      { task: "legacy", agent_id: "legacy", delegation: "fanout" },
      rootCaller(),
    );
    await original.coordinator.cancel("root", "legacy");
    const snapshot = original.coordinator.snapshot();
    snapshot.agents[0] = {
      ...snapshot.agents[0]!,
      agent_id: "root.legacy",
      latest_result: snapshot.agents[0]!.latest_result
        ? { ...snapshot.agents[0]!.latest_result, agent_id: "root.legacy" }
        : undefined,
    };

    const restored = makeCoordinator();
    await restored.coordinator.restore(snapshot);
    const spawned = await restored.coordinator.spawn(
      "root",
      { task: "new", agent_id: "new" },
      rootCaller(),
    );

    expect(restored.coordinator.canAgentSpawn("root.legacy")).toBe(true);
    expect(spawned.agent_id).toBe("root.new");
  });

  it("reserves explicit IDs before asynchronous validation so concurrent spawns cannot overwrite", async () => {
    const { coordinator } = makeCoordinator();
    const first = coordinator.spawn("root", { task: "first", agent_id: "worker" }, rootCaller());
    const duplicate = coordinator.spawn(
      "root",
      { task: "second", agent_id: "worker" },
      rootCaller(),
    );

    await expect(duplicate).rejects.toThrow("Minimal subagents duplicate agent ID: worker");
    await expect(first).resolves.toEqual(expect.objectContaining({ agent_id: "worker" }));
  });

  it("allows explicit fanout but denies ordinary-child and depth-three delegation", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn("root", { task: "ordinary", agent_id: "ordinary" }, rootCaller());
    await expect(coordinator.spawn("ordinary", { task: "nested" }, rootCaller())).rejects.toThrow(
      "Minimal subagents delegation denied: ordinary is not authorized for fanout",
    );

    await coordinator.spawn(
      "root",
      { task: "lead", agent_id: "lead", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn(
      "lead",
      { task: "review", agent_id: "review", delegation: "fanout" },
      rootCaller(),
    );
    expect(coordinator.canAgentSpawn("lead")).toBe(true);
    expect(coordinator.canAgentSpawn("lead.review")).toBe(false);
    await expect(
      coordinator.spawn("lead.review", { task: "too deep" }, rootCaller()),
    ).rejects.toThrow(
      "Minimal subagents maximum delegation depth reached: lead.review (depth 2, max 2)",
    );
  });

  it("uses the configured maximum delegation depth for nested spawning", async () => {
    const { coordinator } = makeCoordinator(0, undefined, 1);
    await coordinator.spawn(
      "root",
      { task: "lead", agent_id: "lead", delegation: "fanout" },
      rootCaller(),
    );

    expect(coordinator.canAgentSpawn("lead")).toBe(false);
    await expect(coordinator.spawn("lead", { task: "too deep" }, rootCaller())).rejects.toThrow(
      "Minimal subagents maximum delegation depth reached: lead (depth 1, max 1)",
    );
  });

  it("retains a restored hierarchy while applying a lower active depth", async () => {
    const original = makeCoordinator();
    await original.coordinator.spawn(
      "root",
      { task: "lead", agent_id: "lead", delegation: "fanout" },
      rootCaller(),
    );
    await original.coordinator.spawn(
      "lead",
      { task: "review", agent_id: "review", delegation: "fanout" },
      rootCaller(),
    );

    const restored = makeCoordinator(0, undefined, 1);
    await restored.coordinator.restore(original.coordinator.snapshot());

    expect(restored.coordinator.inspectStatus()).toEqual({
      root_id: "root",
      agents: [expect.objectContaining({ agent_id: "lead", child_count: 1 })],
    });
    expect(restored.coordinator.inspectStatus("lead.review")).toEqual({
      agent: expect.objectContaining({ agent_id: "lead.review" }),
    });
    expect(restored.coordinator.canAgentSpawn("lead")).toBe(false);
  });

  it("keeps generated peer identities unique and rejects duplicates without overwriting", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn("root", { task: "a", agent_id: "a" }, rootCaller());
    await coordinator.spawn("root", { task: "b", agent_id: "b" }, rootCaller());
    await expect(
      coordinator.spawn("root", { task: "again", agent_id: "a" }, rootCaller()),
    ).rejects.toThrow("Minimal subagents duplicate agent ID: a");
  });

  it("rejects incompatible inherited images before creating an identity", async () => {
    const { coordinator, sessions } = makeCoordinator();
    const imageMessage: AgentMessage = {
      role: "user",
      content: [{ type: "image", data: "x", mimeType: "image/png" }],
      timestamp: 1,
    };
    await expect(
      coordinator.spawn(
        "root",
        { task: "look", model: "openai/text-only" },
        rootCaller({ messages: [imageMessage] }),
      ),
    ).rejects.toThrow("does not support image input");
    expect(sessions.runtimes.size).toBe(0);
    expect(coordinator.inspectStatus()).toEqual({ root_id: "root", agents: [] });
  });
});

describe("MinimalSubagentsCoordinator completion and waiting", () => {
  it("persists the original task and terminal duration for restored UI projections", async () => {
    let timeMs = Date.parse("2026-08-11T12:00:00.000Z");
    const { coordinator, sessions } = makeCoordinator(0, () => new Date(timeMs));
    const spawn = await coordinator.spawn(
      "root",
      { task: "Inspect the complete API surface", agent_id: "worker" },
      rootCaller(),
    );
    expect(coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({
        task: "Inspect the complete API surface",
        latest_activity_at: "2026-08-11T12:00:00.000Z",
      }),
    });

    await flushTasks();
    timeMs += 2_500;
    const wait = coordinator.wait("root", "worker");
    sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "finished",
    });
    await expect(wait).resolves.toEqual(
      expect.objectContaining({ turn_id: spawn.turn_id, elapsed_ms: 2_500 }),
    );
    expect(coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({
        elapsed_ms: 2_500,
        latest_activity_at: "2026-08-11T12:00:02.500Z",
      }),
    });
  });

  it("returns the exact active turn to a direct-parent waiter and suppresses duplicate delivery", async () => {
    const { coordinator, sessions, root } = makeCoordinator();
    const spawn = await coordinator.spawn(
      "root",
      { task: "work", agent_id: "worker" },
      rootCaller(),
    );
    await flushTasks();
    const wait = coordinator.wait("root", "worker");
    sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "finished",
    });

    await expect(wait).resolves.toEqual(
      expect.objectContaining({
        agent_id: "worker",
        turn_id: spawn.turn_id,
        status: "completed",
        output: "finished",
        elapsed_ms: expect.any(Number),
      }),
    );
    await flushTasks();
    await coordinator.reconcileDeliveries();
    expect(root.messages).toEqual([]);
  });

  it("steers a running parent with successful background completion", async () => {
    const { coordinator, sessions, root } = makeCoordinator();
    root.running = true;
    const spawn = await coordinator.spawn(
      "root",
      { task: "work", agent_id: "worker" },
      rootCaller(),
    );
    await flushTasks();
    sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "finished",
    });
    await flushTasks();

    expect(root.messages).toEqual([
      {
        behavior: "steer",
        message: expect.objectContaining({
          customType: "minimal-subagents.result",
          content: "finished",
          details: expect.objectContaining({
            source_turn_id: spawn.turn_id,
            destination_agent_id: "root",
            elapsed_ms: expect.any(Number),
          }),
        }),
      },
    ]);
  });

  it("steers a running child parent with a nested child's successful completion", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("group", { task: "work", agent_id: "child" }, rootCaller());
    await flushTasks();

    sessions.runtimes.get("group.child")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "nested result",
    });
    await flushTasks();

    expect(sessions.runtimes.get("group")!.queued).toContainEqual(
      expect.objectContaining({
        behavior: "steer",
        message: expect.objectContaining({
          customType: "minimal-subagents.result",
          content: "nested result",
        }),
      }),
    );
  });

  it("times out only the wait and leaves the target turn running", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn("root", { task: "work", agent_id: "worker" }, rootCaller());
    await expect(coordinator.wait("root", "worker", 5)).rejects.toThrow(
      "Minimal subagents wait timed out",
    );
    expect(coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({ state: "running" }),
    });
  });

  it("lets a just-completed parent wait settle evidence before delayed automatic delivery", async () => {
    const { coordinator, sessions, root } = makeCoordinator(20);
    root.running = true;
    const spawn = await coordinator.spawn(
      "root",
      { task: "work", agent_id: "worker" },
      rootCaller(),
    );
    await flushTasks();
    sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "finished",
    });
    await flushTasks();
    expect(root.messages).toEqual([]);

    await expect(coordinator.wait("root", "worker")).resolves.toEqual(
      expect.objectContaining({ turn_id: spawn.turn_id, output: "finished" }),
    );
    root.evidence.add(`worker:${spawn.turn_id}`);
    await coordinator.reconcileDeliveries();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(root.messages).toEqual([]);
  });

  it("settles pending delivery from durable evidence and never replays it", async () => {
    const { coordinator, sessions, root } = makeCoordinator();
    const spawn = await coordinator.spawn(
      "root",
      { task: "work", agent_id: "worker" },
      rootCaller(),
    );
    await flushTasks();
    sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "finished",
    });
    await flushTasks();
    expect(root.messages).toHaveLength(1);

    root.evidence.add(`worker:${spawn.turn_id}`);
    await coordinator.reconcileDeliveries();
    await coordinator.reconcileDeliveries();
    expect(root.messages).toHaveLength(1);
    expect(coordinator.snapshot().deliveries).toEqual([
      expect.objectContaining({ source_turn_id: spawn.turn_id, settled: true }),
    ]);
  });
});

describe("MinimalSubagentsCoordinator messaging and lifecycle", () => {
  it("allows direct-relative messages and rejects indirect or broadcast targets", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("root", { task: "peer", agent_id: "peer" }, rootCaller());
    await coordinator.spawn("group", { task: "one", agent_id: "one" }, rootCaller());
    await coordinator.spawn("group", { task: "two", agent_id: "two" }, rootCaller());
    await flushTasks();

    await expect(
      coordinator.message(
        "group.one",
        { agent_id: "group.two", message: "sibling update" },
        "one-turn",
      ),
    ).resolves.toEqual({
      agent_id: "group.two",
      behavior: "steer",
      delivered: true,
    });
    await expect(
      coordinator.message(
        "group",
        { agent_id: "group.one", message: "child update" },
        "group-turn",
      ),
    ).resolves.toEqual({
      agent_id: "group.one",
      behavior: "steer",
      delivered: true,
    });
    await expect(
      coordinator.message("group", { agent_id: "parent", message: "parent update" }, "group-turn"),
    ).resolves.toEqual({ agent_id: "root", behavior: "steer", delivered: true });

    await expect(
      coordinator.message("group.one", { agent_id: "peer", message: "uncle update" }, "one-turn"),
    ).rejects.toThrow(
      "Minimal subagents message authorization denied: group.one cannot message peer",
    );
    await expect(
      coordinator.message(
        "group.one",
        { agent_id: "group.one", message: "self update" },
        "one-turn",
      ),
    ).rejects.toThrow(
      "Minimal subagents message authorization denied: group.one cannot message group.one",
    );
    await expect(
      coordinator.message(
        "root",
        { agent_id: "group.one", message: "indirect update" },
        "root-turn",
      ),
    ).rejects.toThrow(
      "Minimal subagents message authorization denied: root cannot message group.one",
    );
    await expect(
      coordinator.message("group", { agent_id: "*", message: "broadcast" }, "group-turn"),
    ).rejects.toThrow('Minimal subagents message target "*" is unsupported');
  });

  it("returns one failed delivery result for an unavailable direct relative", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn("root", { task: "work", agent_id: "worker" }, rootCaller());
    await flushTasks();
    const snapshot = coordinator.snapshot();
    snapshot.agents[0] = {
      ...snapshot.agents[0]!,
      availability: "unavailable",
      unavailable_reason: "missing model",
      missing_dependencies: ["model"],
      session_file: undefined,
      session_id: undefined,
    };
    await coordinator.restore(snapshot);

    await expect(
      coordinator.message("root", { agent_id: "worker", message: "direct update" }, "root-turn"),
    ).resolves.toEqual({
      agent_id: "worker",
      behavior: "steer",
      delivered: false,
      error: "missing model",
    });
  });

  it("allows waits for direct children only", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("root", { task: "peer", agent_id: "peer" }, rootCaller());
    await coordinator.spawn("group", { task: "child", agent_id: "child" }, rootCaller());
    await flushTasks();
    sessions.runtimes.get("group")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "group done",
    });
    sessions.runtimes.get("peer")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "peer done",
    });
    await flushTasks();

    await expect(coordinator.wait("group", "group.child", 1)).rejects.toThrow(
      "Minimal subagents wait timed out",
    );
    expect(() => coordinator.wait("group", "peer")).toThrow(
      "Minimal subagents wait authorization denied: group cannot target peer",
    );
    expect(() => coordinator.wait("group.child", "group")).toThrow(
      "Minimal subagents wait authorization denied: group.child cannot target group",
    );
  });

  it("scopes status to direct children without recursively exposing their descendants", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("root", { task: "peer", agent_id: "peer" }, rootCaller());
    await coordinator.spawn("group", { task: "child", agent_id: "child" }, rootCaller());
    await flushTasks();

    expect(coordinator.status("root")).toEqual({
      parent_id: "root",
      agents: [
        expect.objectContaining({ agent_id: "group", child_count: 1, children: [] }),
        expect.objectContaining({ agent_id: "peer", child_count: 0, children: [] }),
      ],
    });
    expect(coordinator.status("group", "group.child")).toEqual({
      agent: expect.objectContaining({
        agent_id: "group.child",
        child_count: 0,
        children: [],
      }),
    });
    expect(() => coordinator.status("group", "peer")).toThrow(
      "Minimal subagents status authorization denied: group cannot target peer",
    );
    expect(() => coordinator.status("group", "group")).toThrow(
      "Minimal subagents status authorization denied: group cannot target group",
    );
    expect(() => coordinator.status("root", "group.child")).toThrow(
      "Minimal subagents status authorization denied: root cannot target group.child",
    );
  });

  it("uses an omitted child target as its direct-parent alias", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("group", { task: "child", agent_id: "child" }, rootCaller());
    await flushTasks();

    const result = await coordinator.message("group.child", { message: "need help" }, "child-turn");
    expect(result).toEqual({ agent_id: "group", behavior: "steer", delivered: true });
    expect(sessions.runtimes.get("group")!.queued).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          customType: "minimal-subagents.message",
          details: expect.objectContaining({ source_agent_id: "group.child" }),
        }),
      }),
    ]);
  });

  it("allows lifecycle management to target direct children only", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("group", { task: "child", agent_id: "child" }, rootCaller());
    await flushTasks();

    await expect(coordinator.cancel("root", "group.child")).rejects.toThrow(
      "Minimal subagents cancel authorization denied: root cannot target group.child",
    );
    await expect(coordinator.delete("root", "group.child")).rejects.toThrow(
      "Minimal subagents delete authorization denied: root cannot target group.child",
    );
  });

  it("prevents an ordinary child from cancelling a running sibling", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn("root", { task: "manage", agent_id: "manager" }, rootCaller());
    await coordinator.spawn("root", { task: "work", agent_id: "sibling" }, rootCaller());
    await flushTasks();

    await expect(coordinator.cancel("manager", "sibling")).rejects.toThrow(
      "Minimal subagents cancel authorization denied: manager cannot target sibling",
    );
    expect(coordinator.inspectStatus("sibling")).toEqual({
      agent: expect.objectContaining({ state: "running" }),
    });
  });

  it("prevents a fanout child from managing itself or a sibling branch", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "manage", agent_id: "manager", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("root", { task: "work", agent_id: "sibling" }, rootCaller());
    await flushTasks();

    for (const target of ["manager", "sibling", "root"]) {
      await expect(coordinator.cancel("manager", target)).rejects.toThrow(
        `Minimal subagents cancel authorization denied: manager cannot target ${target}`,
      );
      await expect(coordinator.delete("manager", target)).rejects.toThrow(
        `Minimal subagents delete authorization denied: manager cannot target ${target}`,
      );
    }
  });

  it("allows a fanout child to cancel and delete its strict descendant", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "manage", agent_id: "manager", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("manager", { task: "work", agent_id: "child" }, rootCaller());
    await flushTasks();

    const cancelled = await coordinator.cancel("manager", "manager.child", false);
    expect(cancelled.cancelled_turn_ids).toHaveLength(1);
    expect(sessions.runtimes.get("manager.child")!.aborted).toBe(true);

    const deleted = await coordinator.delete("manager", "manager.child", false);
    expect(deleted.deleted_agent_ids).toEqual(["manager.child"]);
  });

  it("recursively cancels active turns but preserves reusable sessions", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("group", { task: "child", agent_id: "child" }, rootCaller());
    await flushTasks();

    const result = await coordinator.cancel("root", "group");
    expect(result.affected_agent_ids).toEqual(["group", "group.child"]);
    expect(result.cancelled_turn_ids).toHaveLength(2);
    expect(sessions.runtimes.get("group")!.aborted).toBe(true);
    expect(coordinator.inspectStatus("group")).toEqual({
      agent: expect.objectContaining({ state: "idle" }),
    });

    await coordinator.message("root", { agent_id: "group", message: "continue" }, "root-turn");
    expect(coordinator.inspectStatus("group")).toEqual({
      agent: expect.objectContaining({ state: "running" }),
    });
  });

  it("prevents an ordinary child from deleting a sibling session", async () => {
    const { coordinator } = makeCoordinator();
    await coordinator.spawn("root", { task: "manage", agent_id: "manager" }, rootCaller());
    await coordinator.spawn("root", { task: "work", agent_id: "sibling" }, rootCaller());
    await flushTasks();

    await expect(coordinator.delete("manager", "sibling")).rejects.toThrow(
      "Minimal subagents delete authorization denied: manager cannot target sibling",
    );
    expect(coordinator.inspectStatus("sibling")).toEqual({
      agent: expect.objectContaining({ state: "running" }),
    });
  });

  it("deletes descendants before parents and keeps durable tombstones", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn(
      "root",
      { task: "group", agent_id: "group", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("group", { task: "child", agent_id: "child" }, rootCaller());
    await flushTasks();

    const result = await coordinator.delete("root", "group");
    expect(result.deleted_agent_ids).toEqual(["group.child", "group"]);
    expect(sessions.trashOrder).toEqual(["/sessions/group.child.jsonl", "/sessions/group.jsonl"]);
    await expect(
      coordinator.spawn("root", { task: "reuse", agent_id: "group" }, rootCaller()),
    ).rejects.toThrow("Minimal subagents agent ID is tombstoned: group");
  });
});

describe("MinimalSubagentsCoordinator restoration and fork", () => {
  it("replays every pending successful result even after a later turn settles", async () => {
    const original = makeCoordinator();
    await original.coordinator.spawn("root", { task: "first", agent_id: "worker" }, rootCaller());
    await flushTasks();
    original.sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "first output",
    });
    await flushTasks();
    await original.coordinator.message(
      "root",
      { agent_id: "worker", message: "second" },
      "root-second-turn",
    );
    original.sessions.runtimes.get("worker")!.messageOutcomes[0]!.resolve({
      status: "completed",
      output: "second output",
    });
    await flushTasks();

    const restored = makeCoordinator();
    await restored.coordinator.restore(original.coordinator.snapshot());
    expect(restored.root.messages.map(({ message }) => message.content)).toEqual([
      "first output",
      "second output",
    ]);
  });

  it("replays a successful result once when recovery finds no durable destination evidence", async () => {
    const original = makeCoordinator();
    await original.coordinator.spawn("root", { task: "work", agent_id: "worker" }, rootCaller());
    await flushTasks();
    original.sessions.runtimes.get("worker")!.promptOutcomes[0]!.resolve({
      status: "completed",
      output: "recover me",
    });
    await flushTasks();

    const restored = makeCoordinator();
    await restored.coordinator.restore(original.coordinator.snapshot());
    expect(restored.root.messages).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({ content: "recover me" }),
      }),
    ]);
    await restored.coordinator.reconcileDeliveries();
    expect(restored.root.messages).toHaveLength(1);
  });

  it("never reuses a turn ID after registry restoration", async () => {
    const original = makeCoordinator();
    const first = await original.coordinator.spawn(
      "root",
      { task: "work", agent_id: "worker" },
      rootCaller(),
    );
    await flushTasks();
    await original.coordinator.cancel("root", "worker");

    const restored = makeCoordinator();
    await restored.coordinator.restore(original.coordinator.snapshot());
    await restored.coordinator.message(
      "root",
      { agent_id: "worker", message: "again" },
      "root-message-turn",
    );
    expect(restored.coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({
        active_turn_id: expect.not.stringMatching(first.turn_id),
      }),
    });
  });

  it("restores old registry agents without delegation or UI metadata as non-fanout children", async () => {
    const original = makeCoordinator();
    await original.coordinator.spawn("root", { task: "legacy", agent_id: "worker" }, rootCaller());
    await flushTasks();
    await original.coordinator.cancel("root", "worker");
    const snapshot = original.coordinator.snapshot();
    delete snapshot.agents[0]!.task;
    delete snapshot.agents[0]!.latest_activity_at;
    delete snapshot.agents[0]!.launch_contract.delegation;

    const restored = makeCoordinator();
    await restored.coordinator.restore(snapshot);
    expect(restored.coordinator.canAgentSpawn("worker")).toBe(false);
    expect(restored.coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({ task: undefined, latest_activity_at: expect.any(String) }),
    });
  });

  it("preserves activity time when restoration leaves availability unchanged", async () => {
    const original = makeCoordinator();
    await original.coordinator.spawn("root", { task: "work", agent_id: "worker" }, rootCaller());
    await flushTasks();
    await original.coordinator.cancel("root", "worker");
    const snapshot = original.coordinator.snapshot();
    snapshot.agents[0]!.availability = "unavailable";
    snapshot.agents[0]!.latest_activity_at = "2026-08-11T12:00:00.000Z";
    snapshot.agents[0]!.launch_contract.model = "openai/missing";

    const restored = makeCoordinator(0, () => new Date("2026-08-11T13:00:00.000Z"));
    await restored.coordinator.restore(snapshot);
    expect(restored.coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({
        availability: "unavailable",
        latest_activity_at: "2026-08-11T12:00:00.000Z",
      }),
    });
  });

  it("restores unfinished turns as interrupted and marks dependency drift unavailable", async () => {
    const { coordinator } = makeCoordinator();
    const first = await coordinator.spawn(
      "root",
      { task: "work", agent_id: "worker" },
      rootCaller(),
    );
    const snapshot = coordinator.snapshot();
    snapshot.agents[0]!.launch_contract.model = "openai/missing";

    const restoredHarness = makeCoordinator();
    await restoredHarness.coordinator.restore(snapshot);
    expect(restoredHarness.coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({
        state: "idle",
        availability: "unavailable",
        latest_result: expect.objectContaining({ turn_id: first.turn_id, status: "interrupted" }),
        latest_turn: { turn_id: first.turn_id, status: "interrupted" },
        missing_dependencies: ["openai/missing"],
      }),
    });
  });

  it("drains runtime initialization and disposes the late runtime during shutdown", async () => {
    const { coordinator, sessions } = makeCoordinator();
    sessions.holdRuntimeCreation = true;
    await coordinator.spawn("root", { task: "work", agent_id: "worker" }, rootCaller());
    const shutdown = coordinator.shutdown();
    await flushTasks();

    sessions.releaseRuntimeCreation?.();
    await shutdown;
    expect(sessions.runtimes.get("worker")?.disposed).toBe(true);
  });

  it("waits for active turns to settle without aborting them before reload", async () => {
    const { coordinator, sessions, root } = makeCoordinator(5);
    const spawned = await coordinator.spawn(
      "root",
      { task: "finish before reload", agent_id: "worker" },
      rootCaller(),
    );
    await flushTasks();
    const runtime = sessions.runtimes.get("worker")!;
    let shutdownSettled = false;

    const shutdown = coordinator.shutdownAfterSettling().then(() => {
      shutdownSettled = true;
    });
    await flushTasks();

    expect(shutdownSettled).toBe(false);
    expect(runtime.aborted).toBe(false);
    runtime.promptOutcomes[0]!.resolve({ status: "completed", output: "done" });
    await shutdown;

    expect(runtime.aborted).toBe(false);
    expect(runtime.disposed).toBe(true);
    expect(root.messages).toEqual([
      expect.objectContaining({ message: expect.objectContaining({ content: "done" }) }),
    ]);
    expect(coordinator.inspectStatus("worker")).toEqual({
      agent: expect.objectContaining({
        latest_result: expect.objectContaining({
          turn_id: spawned.turn_id,
          status: "completed",
          output: "done",
        }),
      }),
    });
  });

  it("clones peers independently and makes a failed subtree registry-only", async () => {
    const { coordinator, sessions } = makeCoordinator();
    await coordinator.spawn("root", { task: "good", agent_id: "good" }, rootCaller());
    await coordinator.spawn(
      "root",
      { task: "bad", agent_id: "bad", delegation: "fanout" },
      rootCaller(),
    );
    await coordinator.spawn("bad", { task: "leaf", agent_id: "leaf" }, rootCaller());
    await flushTasks();
    await coordinator.cancel("root", "good");
    await coordinator.cancel("root", "bad");
    sessions.cloneFailures.add("bad");

    const fork = await coordinator.prepareFork("/sessions/jsonl");
    expect(fork.agents.find((item) => item.agent_id === "good")?.session_file).toBe(
      "/sessions/good.jsonl.clone",
    );
    expect(fork.agents.find((item) => item.agent_id === "bad")).toEqual(
      expect.objectContaining({ availability: "unavailable", session_file: undefined }),
    );
    expect(fork.agents.find((item) => item.agent_id === "bad.leaf")).toEqual(
      expect.objectContaining({ availability: "unavailable", session_file: undefined }),
    );
  });
});
