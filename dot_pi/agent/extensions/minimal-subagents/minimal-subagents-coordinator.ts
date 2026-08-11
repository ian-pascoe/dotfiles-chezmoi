import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import { assembleImportedContext, contextContainsImages } from "./minimal-subagents-context.js";
import {
  canAgentContractSpawn,
  DEFAULT_MAX_SUBAGENT_DEPTH,
  excludeCoordinatorTools,
  getSubagentDepth,
  resolveOrdinaryToolSelection,
} from "./minimal-subagents-capabilities.js";
import { createRegistryEvent } from "./minimal-subagents-registry.js";
import { addMinimalSubagentsUsage } from "./minimal-subagents-usage.js";
import type {
  AgentDetail,
  AgentSessionFactory,
  AgentSummary,
  CallerSnapshot,
  CancelResult,
  ChildAgentRuntime,
  CoordinatorDependencies,
  CoordinatorMessage,
  DeleteResult,
  ForkSnapshot,
  MessageBehavior,
  MessageResult,
  PersistedAgent,
  PersistedDelivery,
  RegistrySnapshot,
  SpawnParameters,
  SpawnResult,
  StatusResult,
  TurnId,
  TurnResult,
} from "./minimal-subagents-types.js";

const FRIENDLY_AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED_AGENT_IDS = new Set(["root", "parent"]);
const RECENT_MESSAGE_LIMIT = 20;
const DEFAULT_AUTOMATIC_DELIVERY_GRACE_MS = 1_000;

interface MessageParameters {
  agent_id?: string;
  message: string;
  behavior?: MessageBehavior;
}

interface TurnWaiter {
  callerId: string;
  resolve: (result: TurnResult) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
  abortSignal?: AbortSignal;
  abortListener?: () => void;
}

function agentDeliveryKey(agentId: string, turnId: string): string {
  return `${agentId}\u0000${turnId}`;
}

function terminalTurnResult(
  agentId: string,
  turnId: string,
  outcome: Awaited<ReturnType<ChildAgentRuntime["runPrompt"]>>,
): TurnResult {
  return {
    agent_id: agentId,
    turn_id: turnId,
    status: outcome.status,
    output: outcome.output,
    error: outcome.error,
    usage: outcome.usage,
  };
}

/** One root-owned coordinator for persistent nested Pi child sessions. */
export class MinimalSubagentsCoordinator {
  private readonly agents = new Map<string, PersistedAgent>();
  private readonly runtimes = new Map<string, ChildAgentRuntime>();
  private readonly runtimeInitializations = new Map<string, Promise<ChildAgentRuntime>>();
  private readonly importedMessages = new Map<string, AgentMessage[]>();
  private readonly tombstones = new Set<string>();
  private readonly pendingAgentIds = new Set<string>();
  private readonly deliveries = new Map<string, PersistedDelivery>();
  private readonly waiters = new Map<string, Set<TurnWaiter>>();
  private readonly recipientQueues = new Map<string, Promise<void>>();
  private readonly backgroundOperations = new Set<Promise<void>>();
  private acceptingOperations = true;
  private shutdownPromise?: Promise<void>;

  constructor(private readonly dependencies: CoordinatorDependencies) {}

  /** Return a serializable complete hierarchy checkpoint without process-local runtimes. */
  snapshot(): RegistrySnapshot {
    return {
      agents: [...this.agents.values()].map((agent) => structuredClone(agent)),
      tombstones: [...this.tombstones],
      deliveries: [...this.deliveries.values()].map((delivery) => structuredClone(delivery)),
    };
  }

  /** Persist a complete registry checkpoint for initial ownership or fork ownership. */
  writeCheckpoint(): void {
    this.dependencies.registry.append(
      createRegistryEvent(this.dependencies.registry.rootSessionId, "checkpoint", {
        snapshot: this.snapshot(),
      }),
    );
  }

  /** Validate, persist, and schedule one asynchronous child turn. */
  async spawn(
    callerId: string,
    parameters: SpawnParameters,
    caller: CallerSnapshot,
  ): Promise<SpawnResult> {
    this.assertAccepting();
    this.assertCallerExists(callerId);
    this.assertCallerMaySpawn(callerId);
    if (parameters.task.trim().length === 0) {
      throw new Error("Minimal subagents spawn validation: task must not be empty");
    }

    const friendlyId = parameters.agent_id ?? this.generateFriendlyId(callerId);
    this.validateFriendlyId(friendlyId);
    const agentId = `${callerId}.${friendlyId}`;
    if (this.tombstones.has(agentId)) {
      throw new Error(`Minimal subagents agent ID is tombstoned: ${agentId}`);
    }
    if (this.agents.has(agentId) || this.pendingAgentIds.has(agentId)) {
      throw new Error(`Minimal subagents duplicate agent ID: ${agentId}`);
    }

    const sessionContext = parameters.session_context ?? "inherit";
    const projectContext = parameters.project_context ?? "inherit";
    const model = parameters.model ?? caller.model;
    const requestedThinking = parameters.thinking_level ?? caller.thinkingLevel;
    const thinkingLevel = this.dependencies.sessions.resolveThinkingLevel(model, requestedThinking);
    const ordinaryTools = resolveOrdinaryToolSelection(parameters.tools, {
      ordinaryTools: excludeCoordinatorTools(caller.ordinaryTools),
      capabilityCeiling: excludeCoordinatorTools(caller.capabilityCeiling),
      availableTools: excludeCoordinatorTools(caller.availableTools),
    });
    const committedMessages = structuredClone(caller.messages);
    const imported = assembleImportedContext(sessionContext, committedMessages);
    if (
      contextContainsImages(imported.messages) &&
      !this.dependencies.sessions.modelSupportsImages(model)
    ) {
      throw new Error(
        `Minimal subagents spawn validation: model ${model} does not support image input`,
      );
    }

    const createdAt = this.now().toISOString();
    const agent: PersistedAgent = {
      agent_id: agentId,
      friendly_id: friendlyId,
      parent_id: callerId,
      created_at: createdAt,
      task: parameters.task,
      latest_activity_at: createdAt,
      spawn_entry_id: caller.spawnEntryId,
      launch_contract: {
        session_context: sessionContext,
        project_context: projectContext,
        model,
        thinking_level: thinkingLevel,
        tools: parameters.tools,
        ordinary_tools: ordinaryTools,
        delegation: parameters.delegation ?? "none",
      },
      capability_ceiling: [...ordinaryTools],
      availability: "available",
      missing_dependencies: [],
      recent_messages: [],
    };
    this.pendingAgentIds.add(agentId);
    let identity: ReturnType<AgentSessionFactory["createIdentity"]>;
    try {
      const missingDependencies =
        await this.dependencies.sessions.resolveLaunchMissingDependencies(agent);
      this.assertAccepting();
      if (missingDependencies.length > 0) {
        throw new Error(
          `Minimal subagents launch dependencies unavailable: ${missingDependencies.join(", ")}`,
        );
      }
      identity = this.dependencies.sessions.createIdentity(agent, imported.messages);
    } finally {
      this.pendingAgentIds.delete(agentId);
    }
    agent.session_file = identity.sessionFile;
    agent.session_id = identity.sessionId;
    this.agents.set(agentId, agent);
    this.importedMessages.set(agentId, imported.messages);
    this.dependencies.registry.append(
      createRegistryEvent(this.dependencies.registry.rootSessionId, "agent-created", { agent }),
    );
    const turnId = this.beginTurn(agent);
    this.dependencies.notify?.({
      type: "spawn",
      agentId,
      message: `Spawned ${agentId}`,
    });

    this.trackBackgroundOperation(
      this.initializeAndRunPrompt(
        agentId,
        turnId,
        parameters.task,
        imported.compact,
        caller.model,
        caller.thinkingLevel,
      ),
    );
    return { agent_id: agentId, turn_id: turnId, status: "running" };
  }

  /** Capture immutable launch defaults for a nested caller from its active child runtime. */
  snapshotChildCaller(agentId: string, spawnEntryId: string): CallerSnapshot {
    const agent = this.requireAgent(agentId);
    const runtime = this.runtimes.get(agentId);
    return {
      messages: runtime?.snapshotCommittedMessages() ?? [],
      model: agent.launch_contract.model,
      thinkingLevel: agent.launch_contract.thinking_level,
      ordinaryTools: [...agent.launch_contract.ordinary_tools],
      capabilityCeiling: [...agent.capability_ceiling],
      availableTools: [...agent.capability_ceiling],
      spawnEntryId,
    };
  }

  /** Send a direct, parent-alias, or snapshotted broadcast conversation-plane message. */
  async message(
    callerId: string,
    parameters: MessageParameters,
    sourceTurnId: string,
  ): Promise<MessageResult> {
    this.assertAccepting();
    this.assertCallerExists(callerId);
    const behavior = parameters.behavior ?? "steer";
    const targets = this.resolveMessageTargets(callerId, parameters.agent_id);
    const deliveries = await Promise.all(
      targets.map(async (targetId) => {
        try {
          await this.enqueueRecipientDelivery(targetId, async () => {
            await this.deliverExplicitMessage(
              callerId,
              targetId,
              sourceTurnId,
              parameters.message,
              behavior,
            );
          });
          return { agent_id: targetId, delivered: true as const };
        } catch (error) {
          return {
            agent_id: targetId,
            delivered: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    return { behavior, deliveries };
  }

  /** Wait for the exact active turn captured at invocation, or return the latest idle result. */
  wait(
    callerId: string,
    agentId: string,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<TurnResult> {
    this.assertAccepting();
    this.assertCallerExists(callerId);
    const agent = this.requireUsableAgent(agentId, "wait");
    if (!agent.active_turn_id) {
      if (agent.latest_result) return Promise.resolve(structuredClone(agent.latest_result));
      return Promise.reject(new Error(`Minimal subagents wait: ${agentId} has no turn to observe`));
    }
    const turnId = agent.active_turn_id;
    const key = agentDeliveryKey(agentId, turnId);

    return new Promise<TurnResult>((resolve, reject) => {
      const waiter: TurnWaiter = { callerId, resolve, reject, abortSignal: signal };
      let turnWaiters = this.waiters.get(key);
      if (!turnWaiters) {
        turnWaiters = new Set();
        this.waiters.set(key, turnWaiters);
      }
      turnWaiters.add(waiter);
      const stopWaiting = (error: Error) => {
        this.removeWaiter(key, waiter);
        reject(error);
      };
      if (timeoutMs !== undefined) {
        waiter.timeout = setTimeout(
          () =>
            stopWaiting(
              new Error(`Minimal subagents wait timed out for ${agentId} after ${timeoutMs}ms`),
            ),
          timeoutMs,
        );
      }
      if (signal) {
        waiter.abortListener = () =>
          stopWaiting(new Error(`Minimal subagents wait cancelled for ${agentId}`));
        if (signal.aborted) waiter.abortListener();
        else signal.addEventListener("abort", waiter.abortListener, { once: true });
      }
    });
  }

  /** Return either the concise hierarchy or detailed status for one agent. */
  status(agentId?: string): StatusResult {
    if (agentId !== undefined) return { agent: this.buildAgentDetail(this.requireAgent(agentId)) };
    return {
      root_id: "root",
      agents: this.childrenOf("root").map((agent) => this.buildAgentSummary(agent)),
    };
  }

  /** Report whether root or one explicitly authorized child can create another agent. */
  canAgentSpawn(callerId: string): boolean {
    if (callerId === "root") return true;
    const caller = this.agents.get(callerId);
    return caller
      ? canAgentContractSpawn(caller.agent_id, caller.launch_contract.delegation)
      : false;
  }

  /** Abort active target turns while preserving every persistent child session. */
  async cancel(agentId: string, recursive = true): Promise<CancelResult> {
    this.assertAccepting();
    const target = this.requireUsableAgent(agentId, "cancel");
    const affected = recursive ? [target, ...this.descendantsOf(agentId)] : [target];
    const cancelledTurnIds: string[] = [];
    for (const agent of affected) {
      if (!agent.active_turn_id) continue;
      const turnId = agent.active_turn_id;
      cancelledTurnIds.push(turnId);
      const runtime = this.runtimes.get(agent.agent_id);
      if (runtime) await runtime.abort();
      this.settleTurn(agent, turnId, {
        agent_id: agent.agent_id,
        turn_id: turnId,
        status: "cancelled",
        output: "",
      });
      this.dependencies.notify?.({
        type: "cancellation",
        agentId: agent.agent_id,
        message: `Cancelled ${agent.agent_id}`,
      });
    }
    return {
      agent_id: agentId,
      recursive,
      affected_agent_ids: affected.map((agent) => agent.agent_id),
      cancelled_turn_ids: cancelledTurnIds,
    };
  }

  /** Delete sessions post-order; failed branches stay live and successful tombstones never roll back. */
  async delete(agentId: string, recursive = true): Promise<DeleteResult> {
    this.assertAccepting();
    const target = this.requireAgent(agentId);
    const descendants = this.descendantsOf(agentId);
    if (!recursive && descendants.length > 0) {
      throw new Error(
        `Minimal subagents delete: ${agentId} has descendants; use recursive deletion`,
      );
    }
    const ordered = recursive ? [...descendants].reverse().concat(target) : [target];
    const result: DeleteResult = {
      agent_id: agentId,
      recursive,
      deleted_agent_ids: [],
      tombstoned_agent_ids: [],
      trashed_session_files: [],
      failures: [],
    };
    const failedAncestors = new Set<string>();

    for (const agent of ordered) {
      if (
        [...failedAncestors].some(
          (failedId) => agent.agent_id === failedId || failedId.startsWith(`${agent.agent_id}.`),
        )
      ) {
        continue;
      }
      const runtime = this.runtimes.get(agent.agent_id);
      try {
        if (agent.active_turn_id) await this.cancel(agent.agent_id, false);
        runtime?.dispose();
        this.runtimes.delete(agent.agent_id);
        if (agent.session_file) {
          await this.dependencies.sessions.trashSessionFile(agent.session_file);
          result.trashed_session_files.push(agent.session_file);
        }
        this.agents.delete(agent.agent_id);
        this.importedMessages.delete(agent.agent_id);
        this.tombstones.add(agent.agent_id);
        result.deleted_agent_ids.push(agent.agent_id);
        result.tombstoned_agent_ids.push(agent.agent_id);
        this.dependencies.registry.append(
          createRegistryEvent(this.dependencies.registry.rootSessionId, "agent-deleted", {
            agent_ids: [agent.agent_id],
          }),
        );
      } catch (error) {
        failedAncestors.add(agent.agent_id);
        if (runtime && agent.session_file) {
          try {
            this.runtimes.set(
              agent.agent_id,
              await this.dependencies.sessions.restoreRuntime(agent),
            );
          } catch (restoreError) {
            agent.availability = "unavailable";
            agent.unavailable_reason = `Deletion recovery failed: ${
              restoreError instanceof Error ? restoreError.message : String(restoreError)
            }`;
          }
        }
        result.failures.push({
          agent_id: agent.agent_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  /** Restore non-deleted descendants, interrupt unfinished work, and reconcile pending successful output. */
  async restore(snapshot: RegistrySnapshot): Promise<void> {
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.agents.clear();
    this.runtimes.clear();
    this.runtimeInitializations.clear();
    this.importedMessages.clear();
    this.pendingAgentIds.clear();
    this.tombstones.clear();
    this.deliveries.clear();
    this.waiters.clear();
    this.acceptingOperations = true;
    this.shutdownPromise = undefined;

    for (const agent of snapshot.agents) this.agents.set(agent.agent_id, structuredClone(agent));
    for (const tombstone of snapshot.tombstones) this.tombstones.add(tombstone);
    for (const delivery of snapshot.deliveries) {
      this.deliveries.set(
        agentDeliveryKey(delivery.source_agent_id, delivery.source_turn_id),
        structuredClone(delivery),
      );
    }

    for (const agent of this.agents.values()) {
      if (agent.active_turn_id) {
        const interrupted: TurnResult = {
          agent_id: agent.agent_id,
          turn_id: agent.active_turn_id,
          status: "interrupted",
          output: "",
          error: "Turn interrupted because the owning Pi process exited",
        };
        this.settleTurn(agent, agent.active_turn_id, interrupted);
        this.dependencies.notify?.({
          type: "interruption",
          agentId: agent.agent_id,
          message: `Restored ${agent.agent_id} with an interrupted turn`,
        });
      }
      const previousAvailability = agent.availability;
      const missing = agent.clone_error
        ? [agent.clone_error]
        : await this.dependencies.sessions.resolveRestorationMissingDependencies(agent);
      if (missing.length > 0 || !agent.session_file) {
        agent.availability = "unavailable";
        if (previousAvailability !== "unavailable")
          agent.latest_activity_at = this.now().toISOString();
        agent.missing_dependencies = missing.length > 0 ? missing : agent.missing_dependencies;
        agent.unavailable_reason =
          agent.clone_error ??
          (missing.length > 0
            ? `Missing dependencies: ${missing.join(", ")}`
            : (agent.unavailable_reason ?? `No persistent session exists for ${agent.agent_id}`));
        this.dependencies.notify?.({
          type: "unavailable",
          agentId: agent.agent_id,
          message: `${agent.agent_id} unavailable: ${agent.unavailable_reason}`,
        });
        continue;
      }
      try {
        this.runtimes.set(agent.agent_id, await this.dependencies.sessions.restoreRuntime(agent));
        agent.availability = "available";
        if (previousAvailability !== "available")
          agent.latest_activity_at = this.now().toISOString();
        agent.missing_dependencies = [];
        agent.unavailable_reason = undefined;
        this.dependencies.notify?.({
          type: "restoration",
          agentId: agent.agent_id,
          message: `Restored ${agent.agent_id}`,
        });
      } catch (error) {
        agent.availability = "unavailable";
        if (previousAvailability !== "unavailable")
          agent.latest_activity_at = this.now().toISOString();
        agent.unavailable_reason = error instanceof Error ? error.message : String(error);
        this.dependencies.notify?.({
          type: "unavailable",
          agentId: agent.agent_id,
          message: `${agent.agent_id} unavailable: ${agent.unavailable_reason}`,
        });
      }
    }
    await this.reconcileDeliveries(true);
  }

  /** Schedule delivery reconciliation as coordinator-owned work drained during shutdown. */
  scheduleDeliveryReconciliation(replayMissing = false): void {
    this.trackBackgroundOperation(this.reconcileDeliveries(replayMissing));
  }

  /** Reconcile durable destination evidence and replay only successful undelivered output. */
  async reconcileDeliveries(replayMissing = false): Promise<void> {
    for (const delivery of this.deliveries.values()) {
      if (delivery.settled) continue;
      const agent = this.agents.get(delivery.source_agent_id);
      const result = delivery.result ?? agent?.latest_result;
      if (!result || result.status !== "completed" || result.turn_id !== delivery.source_turn_id)
        continue;
      if (this.hasDeliveryEvidence(delivery)) {
        this.settleDelivery(delivery);
        continue;
      }
      if (!replayMissing) continue;
      delivery.path = "message";
      this.dependencies.registry.append(
        createRegistryEvent(this.dependencies.registry.rootSessionId, "delivery-pending", {
          delivery,
        }),
      );
      await this.deliverAutomaticResult(result, delivery);
    }
  }

  /** Clone complete child leaves for root fork ownership without ever sharing source session paths. */
  async prepareFork(sourceRootSessionFile: string): Promise<ForkSnapshot> {
    this.acceptingOperations = false;
    const activeRootChildren = this.childrenOf("root");
    for (const child of activeRootChildren) await this.cancelDuringShutdown(child.agent_id);
    await Promise.allSettled(this.runtimeInitializations.values());
    await Promise.allSettled(this.backgroundOperations);
    await Promise.allSettled(this.recipientQueues.values());
    const forkAgents: PersistedAgent[] = [];
    const failedSubtrees = new Set<string>();

    for (const agent of this.agents.values()) {
      const failedAncestor = [...failedSubtrees].find(
        (failedId) => agent.agent_id === failedId || agent.agent_id.startsWith(`${failedId}.`),
      );
      if (failedAncestor) {
        forkAgents.push(
          this.createForkPlaceholder(agent, `Ancestor clone failed: ${failedAncestor}`),
        );
        continue;
      }
      try {
        const clone = await this.dependencies.sessions.cloneSession(agent);
        forkAgents.push({
          ...structuredClone(agent),
          session_file: clone.sessionFile,
          session_id: clone.sessionId,
          active_turn_id: undefined,
          active_turn_started_at: undefined,
        });
      } catch (error) {
        const cloneError = error instanceof Error ? error.message : String(error);
        failedSubtrees.add(agent.agent_id);
        forkAgents.push(this.createForkPlaceholder(agent, cloneError));
        this.dependencies.notify?.({
          type: "fork-clone-failure",
          agentId: agent.agent_id,
          message: `Fork clone failed for ${agent.agent_id}: ${cloneError}`,
        });
      }
    }

    return {
      source_root_session_file: sourceRootSessionFile,
      agents: forkAgents,
      tombstones: [...this.tombstones],
      deliveries: [...this.deliveries.values()].map((delivery) => structuredClone(delivery)),
    };
  }

  /** Stop new operations and idempotently cancel and dispose every child runtime. */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.acceptingOperations = false;
    this.shutdownPromise = (async () => {
      const roots = this.childrenOf("root");
      for (const child of roots) {
        if (this.agents.has(child.agent_id)) await this.cancelDuringShutdown(child.agent_id);
      }
      await Promise.allSettled(this.runtimeInitializations.values());
      await Promise.allSettled(this.backgroundOperations);
      await Promise.allSettled(this.recipientQueues.values());
      for (const runtime of this.runtimes.values()) runtime.dispose();
      this.runtimes.clear();
    })();
    return this.shutdownPromise;
  }

  private async initializeAndRunPrompt(
    agentId: string,
    turnId: string,
    task: string,
    compact: boolean,
    callerModel: string,
    callerThinkingLevel: CallerSnapshot["thinkingLevel"],
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    try {
      const runtime = await this.ensureRuntime(agent);
      if (this.agents.get(agentId) !== agent || agent.active_turn_id !== turnId) {
        if (!this.agents.has(agentId) || !this.acceptingOperations) {
          runtime.dispose();
          this.runtimes.delete(agentId);
        }
        return;
      }
      const outcome = await runtime.runPrompt(task, compact, callerModel, callerThinkingLevel);
      if (agent.active_turn_id !== turnId) return;
      this.settleTurn(agent, turnId, terminalTurnResult(agentId, turnId, outcome));
    } catch (error) {
      if (this.agents.get(agentId) !== agent || agent.active_turn_id !== turnId) return;
      this.settleTurn(agent, turnId, {
        agent_id: agentId,
        turn_id: turnId,
        status: "failed",
        output: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private ensureRuntime(agent: PersistedAgent): Promise<ChildAgentRuntime> {
    const current = this.runtimes.get(agent.agent_id);
    if (current) return Promise.resolve(current);
    const initializing = this.runtimeInitializations.get(agent.agent_id);
    if (initializing) return initializing;
    if (agent.clone_error || !agent.session_file || !agent.session_id) {
      return Promise.reject(
        new Error(agent.clone_error ?? `No persistent session exists for ${agent.agent_id}`),
      );
    }
    const importedMessages = this.importedMessages.get(agent.agent_id);
    const initialization = (
      importedMessages
        ? this.dependencies.sessions.createRuntime({ agent, importedMessages })
        : this.dependencies.sessions.restoreRuntime(agent)
    )
      .then((runtime) => {
        if (this.agents.get(agent.agent_id) !== agent) {
          runtime.dispose();
          throw new Error(`Minimal subagents runtime replaced while opening ${agent.agent_id}`);
        }
        this.runtimes.set(agent.agent_id, runtime);
        this.importedMessages.delete(agent.agent_id);
        return runtime;
      })
      .finally(() => {
        if (this.runtimeInitializations.get(agent.agent_id) === initialization) {
          this.runtimeInitializations.delete(agent.agent_id);
        }
      });
    this.runtimeInitializations.set(agent.agent_id, initialization);
    return initialization;
  }

  private beginTurn(agent: PersistedAgent): TurnId {
    const turnId = `${agent.agent_id}:turn-${randomUUID()}` as TurnId;
    const startedAt = this.now().toISOString();
    agent.active_turn_id = turnId;
    agent.active_turn_started_at = startedAt;
    agent.latest_activity_at = startedAt;
    this.dependencies.registry.append(
      createRegistryEvent(this.dependencies.registry.rootSessionId, "turn-started", {
        agent_id: agent.agent_id,
        turn_id: turnId,
        started_at: startedAt,
      }),
    );
    return turnId;
  }

  private settleTurn(agent: PersistedAgent, turnId: string, result: TurnResult): void {
    if (agent.active_turn_id !== turnId) return;
    const settledAt = this.now();
    const startedAt = agent.active_turn_started_at
      ? new Date(agent.active_turn_started_at).getTime()
      : Number.NaN;
    result = {
      ...result,
      elapsed_ms:
        result.elapsed_ms ??
        (Number.isFinite(startedAt) ? Math.max(0, settledAt.getTime() - startedAt) : undefined),
    };
    agent.active_turn_id = undefined;
    agent.active_turn_started_at = undefined;
    agent.latest_activity_at = settledAt.toISOString();
    agent.latest_result = structuredClone(result);
    this.dependencies.registry.append(
      createRegistryEvent(this.dependencies.registry.rootSessionId, "turn-settled", { result }),
    );
    const waiterKey = agentDeliveryKey(agent.agent_id, turnId);
    const turnWaiters = this.waiters.get(waiterKey);
    const directParentWaited = [...(turnWaiters ?? [])].some(
      (waiter) => waiter.callerId === agent.parent_id,
    );
    for (const waiter of turnWaiters ?? []) {
      this.removeWaiter(waiterKey, waiter);
      waiter.resolve(structuredClone(result));
    }
    if (result.status === "completed") {
      const delivery: PersistedDelivery = {
        source_agent_id: agent.agent_id,
        source_turn_id: turnId,
        destination_agent_id: agent.parent_id,
        path: directParentWaited ? "wait" : "message",
        settled: false,
        result: structuredClone(result),
      };
      this.deliveries.set(waiterKey, delivery);
      this.dependencies.registry.append(
        createRegistryEvent(this.dependencies.registry.rootSessionId, "delivery-pending", {
          delivery,
        }),
      );
      if (!directParentWaited) {
        this.trackBackgroundOperation(this.deliverAutomaticResult(result, delivery));
      }
      this.dependencies.notify?.({
        type: "completion",
        agentId: agent.agent_id,
        message: `${agent.agent_id} completed`,
      });
    } else if (result.status === "failed") {
      this.dependencies.notify?.({
        type: "failure",
        agentId: agent.agent_id,
        message: `${agent.agent_id} failed: ${result.error ?? "unknown error"}`,
      });
    }
  }

  private async deliverAutomaticResult(
    result: TurnResult,
    delivery: PersistedDelivery,
  ): Promise<void> {
    const graceMs =
      this.dependencies.automaticDeliveryGraceMs ?? DEFAULT_AUTOMATIC_DELIVERY_GRACE_MS;
    if (graceMs > 0) await new Promise((resolve) => setTimeout(resolve, graceMs));
    if (delivery.settled) return;
    if (this.hasDeliveryEvidence(delivery)) {
      this.settleDelivery(delivery);
      return;
    }
    try {
      await this.enqueueRecipientDelivery(delivery.destination_agent_id, async () => {
        const message: CoordinatorMessage = {
          customType: "minimal-subagents.result",
          content: result.output,
          details: {
            source_agent_id: delivery.source_agent_id,
            destination_agent_id: delivery.destination_agent_id,
            source_turn_id: result.turn_id,
            status: result.status,
            elapsed_ms: result.elapsed_ms,
            usage: result.usage,
          },
        };
        await this.deliverToRecipient(delivery.destination_agent_id, message, "follow-up");
      });
    } catch (error) {
      delivery.error = error instanceof Error ? error.message : String(error);
      this.dependencies.registry.append(
        createRegistryEvent(this.dependencies.registry.rootSessionId, "delivery-settled", {
          source_agent_id: delivery.source_agent_id,
          source_turn_id: delivery.source_turn_id,
          error: delivery.error,
        }),
      );
    }
  }

  private async deliverExplicitMessage(
    callerId: string,
    targetId: string,
    sourceTurnId: string,
    content: string,
    behavior: MessageBehavior,
  ): Promise<void> {
    const message: CoordinatorMessage = {
      customType: "minimal-subagents.message",
      content,
      details: {
        source_agent_id: callerId,
        destination_agent_id: targetId,
        source_turn_id: sourceTurnId,
      },
    };
    if (targetId !== "root") {
      const target = this.requireUsableAgent(targetId, "message");
      target.recent_messages.push({
        source_agent_id: callerId,
        turn_id: sourceTurnId,
        content,
      });
      if (target.recent_messages.length > RECENT_MESSAGE_LIMIT) target.recent_messages.shift();
    }
    await this.deliverToRecipient(targetId, message, behavior);
  }

  private async deliverToRecipient(
    targetId: string,
    message: CoordinatorMessage,
    behavior: MessageBehavior,
  ): Promise<void> {
    if (!this.acceptingOperations) {
      throw new Error("Minimal subagents delivery stopped during coordinator shutdown");
    }
    if (targetId === "root") {
      await this.dependencies.root.deliverMessage(
        message,
        this.dependencies.root.isRunning() ? behavior : "steer",
      );
      return;
    }
    const target = this.requireUsableAgent(targetId, "message");
    const runtime = await this.ensureRuntime(target);
    if (target.active_turn_id || runtime.isRunning) {
      await runtime.queueMessage(message, behavior);
      return;
    }
    const turnId = this.beginTurn(target);
    const runMessage = runtime
      .runMessage(message)
      .then((outcome) => {
        if (target.active_turn_id === turnId) {
          this.settleTurn(target, turnId, terminalTurnResult(target.agent_id, turnId, outcome));
        }
      })
      .catch((error: unknown) => {
        if (target.active_turn_id === turnId) {
          this.settleTurn(target, turnId, {
            agent_id: target.agent_id,
            turn_id: turnId,
            status: "failed",
            output: "",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    this.trackBackgroundOperation(runMessage);
  }

  private trackBackgroundOperation(operation: Promise<void>): void {
    this.backgroundOperations.add(operation);
    const cleanup = () => this.backgroundOperations.delete(operation);
    void operation.then(cleanup, cleanup);
  }

  private enqueueRecipientDelivery(
    targetId: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const previous = this.recipientQueues.get(targetId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.recipientQueues.set(targetId, next);
    const cleanup = () => {
      if (this.recipientQueues.get(targetId) === next) this.recipientQueues.delete(targetId);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  private resolveMessageTargets(callerId: string, target?: string): string[] {
    const resolved = target ?? (callerId === "root" ? undefined : "parent");
    if (!resolved) throw new Error("Minimal subagents message: root caller must specify agent_id");
    if (resolved === "parent") {
      if (callerId === "root") throw new Error("Minimal subagents message: root has no parent");
      return [this.requireAgent(callerId).parent_id];
    }
    if (resolved === "*") {
      return ["root", ...this.agents.keys()].filter((agentId) => agentId !== callerId);
    }
    if (resolved === "root") return ["root"];
    this.requireAgent(resolved);
    return [resolved];
  }

  private hasDeliveryEvidence(delivery: PersistedDelivery): boolean {
    if (delivery.destination_agent_id === "root") {
      return this.dependencies.root.hasDeliveryEvidence(
        delivery.source_agent_id,
        delivery.source_turn_id,
      );
    }
    return (
      this.runtimes
        .get(delivery.destination_agent_id)
        ?.hasDeliveryEvidence(delivery.source_agent_id, delivery.source_turn_id) ?? false
    );
  }

  private settleDelivery(delivery: PersistedDelivery): void {
    delivery.settled = true;
    delivery.error = undefined;
    this.dependencies.registry.append(
      createRegistryEvent(this.dependencies.registry.rootSessionId, "delivery-settled", {
        source_agent_id: delivery.source_agent_id,
        source_turn_id: delivery.source_turn_id,
      }),
    );
  }

  private buildAgentSummary(agent: PersistedAgent): AgentSummary {
    const children = this.childrenOf(agent.agent_id).map((child) => this.buildAgentSummary(child));
    const elapsed = agent.active_turn_started_at
      ? Math.max(0, this.now().getTime() - new Date(agent.active_turn_started_at).getTime())
      : undefined;
    return {
      agent_id: agent.agent_id,
      parent_id: agent.parent_id,
      state: agent.active_turn_id ? "running" : "idle",
      availability: agent.availability,
      active_turn_id: agent.active_turn_id,
      latest_turn: agent.latest_result
        ? { turn_id: agent.latest_result.turn_id, status: agent.latest_result.status }
        : undefined,
      model: agent.launch_contract.model,
      thinking_level: agent.launch_contract.thinking_level,
      tools: [...agent.launch_contract.ordinary_tools],
      elapsed_ms: elapsed ?? agent.latest_result?.elapsed_ms,
      latest_activity_at: agent.latest_activity_at ?? agent.created_at,
      task: agent.task,
      latest_activity: agent.active_turn_id
        ? "turn running"
        : agent.latest_result
          ? `turn ${agent.latest_result.status}`
          : "created",
      child_count: children.length,
      children,
    };
  }

  private buildAgentDetail(agent: PersistedAgent): AgentDetail {
    const summary = this.buildAgentSummary(agent);
    const runtimeUsage = this.runtimes.get(agent.agent_id)?.getUsage();
    let descendantUsage: Usage | undefined;
    for (const descendant of this.descendantsOf(agent.agent_id)) {
      descendantUsage = addMinimalSubagentsUsage(
        descendantUsage,
        this.runtimes.get(descendant.agent_id)?.getUsage(),
      );
    }
    return {
      ...summary,
      session_file: agent.session_file,
      launch_contract: structuredClone(agent.launch_contract) as unknown as Record<string, unknown>,
      capability_ceiling: [...agent.capability_ceiling],
      spawn_entry_id: agent.spawn_entry_id,
      recent_messages: structuredClone(agent.recent_messages),
      latest_result: agent.latest_result ? structuredClone(agent.latest_result) : undefined,
      missing_dependencies: [...agent.missing_dependencies],
      unavailable_reason: agent.unavailable_reason,
      usage: runtimeUsage ?? agent.latest_result?.usage,
      descendant_usage: descendantUsage,
    };
  }

  private descendantsOf(agentId: string): PersistedAgent[] {
    const descendants: PersistedAgent[] = [];
    const queue = this.childrenOf(agentId);
    while (queue.length > 0) {
      const agent = queue.shift()!;
      descendants.push(agent);
      queue.push(...this.childrenOf(agent.agent_id));
    }
    return descendants;
  }

  private childrenOf(parentId: string): PersistedAgent[] {
    return [...this.agents.values()].filter((agent) => agent.parent_id === parentId);
  }

  private requireAgent(agentId: string): PersistedAgent {
    if (agentId === "root") throw new Error("Minimal subagents management target cannot be root");
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Minimal subagents unknown agent: ${agentId}`);
    return agent;
  }

  private requireUsableAgent(agentId: string, operation: string): PersistedAgent {
    const agent = this.requireAgent(agentId);
    if (agent.availability === "unavailable") {
      throw new Error(
        agent.unavailable_reason ?? `Minimal subagents ${operation}: ${agentId} is unavailable`,
      );
    }
    if (agent.clone_error || !agent.session_file) {
      throw new Error(
        `Minimal subagents ${operation}: ${agent.clone_error ?? `${agentId} has no child session`}`,
      );
    }
    return agent;
  }

  private assertCallerExists(callerId: string): void {
    if (callerId === "root") return;
    this.requireUsableAgent(callerId, "caller");
  }

  private assertCallerMaySpawn(callerId: string): void {
    if (callerId === "root") return;
    const depth = getSubagentDepth(callerId);
    if (depth >= DEFAULT_MAX_SUBAGENT_DEPTH) {
      throw new Error(
        `Minimal subagents maximum delegation depth reached: ${callerId} (depth ${depth}, max ${DEFAULT_MAX_SUBAGENT_DEPTH})`,
      );
    }
    const caller = this.requireUsableAgent(callerId, "delegation");
    if (caller.launch_contract.delegation !== "fanout") {
      throw new Error(
        `Minimal subagents delegation denied: ${callerId} is not authorized for fanout`,
      );
    }
  }

  private validateFriendlyId(friendlyId: string): void {
    if (!FRIENDLY_AGENT_ID_PATTERN.test(friendlyId) || RESERVED_AGENT_IDS.has(friendlyId)) {
      throw new Error(
        `Minimal subagents invalid friendly agent ID: ${JSON.stringify(friendlyId)}; expected ${FRIENDLY_AGENT_ID_PATTERN.source}`,
      );
    }
  }

  private generateFriendlyId(parentId: string): string {
    let index = 1;
    while (
      this.agents.has(`${parentId}.agent-${index}`) ||
      this.pendingAgentIds.has(`${parentId}.agent-${index}`) ||
      this.tombstones.has(`${parentId}.agent-${index}`)
    ) {
      index++;
    }
    return `agent-${index}`;
  }

  private createForkPlaceholder(agent: PersistedAgent, cloneError: string): PersistedAgent {
    return {
      ...structuredClone(agent),
      session_file: undefined,
      session_id: undefined,
      clone_error: cloneError,
      active_turn_id: undefined,
      active_turn_started_at: undefined,
      latest_activity_at: this.now().toISOString(),
      availability: "unavailable",
      missing_dependencies: [cloneError],
      unavailable_reason: cloneError,
    };
  }

  private removeWaiter(key: string, waiter: TurnWaiter): void {
    const turnWaiters = this.waiters.get(key);
    turnWaiters?.delete(waiter);
    if (turnWaiters?.size === 0) this.waiters.delete(key);
    if (waiter.timeout) clearTimeout(waiter.timeout);
    if (waiter.abortSignal && waiter.abortListener) {
      waiter.abortSignal.removeEventListener("abort", waiter.abortListener);
    }
  }

  private async cancelDuringShutdown(agentId: string): Promise<void> {
    const target = this.agents.get(agentId);
    if (!target) return;
    const affected = [target, ...this.descendantsOf(agentId)];
    for (const agent of affected) {
      if (!agent.active_turn_id) continue;
      const turnId = agent.active_turn_id;
      const runtime = this.runtimes.get(agent.agent_id);
      if (runtime) await runtime.abort();
      this.settleTurn(agent, turnId, {
        agent_id: agent.agent_id,
        turn_id: turnId,
        status: "cancelled",
        output: "",
      });
    }
  }

  private assertAccepting(): void {
    if (!this.acceptingOperations)
      throw new Error("Minimal subagents coordinator is shutting down");
  }

  private now(): Date {
    return this.dependencies.now?.() ?? new Date();
  }
}
