import { fileURLToPath } from "node:url";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  buildSessionContext,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { MinimalSubagentsCoordinator } from "./minimal-subagents/minimal-subagents-coordinator.js";
import { snapshotCommittedContext } from "./minimal-subagents/minimal-subagents-context.js";
import {
  rememberForkSnapshot,
  takeForkSnapshot,
} from "./minimal-subagents/minimal-subagents-fork-lifecycle.js";
import {
  buildEligibleModelIds,
  COORDINATOR_TOOL_NAMES,
  excludeCoordinatorTools,
} from "./minimal-subagents/minimal-subagents-capabilities.js";
import {
  CHILD_IDENTITY_ENTRY_TYPE,
  REGISTRY_ENTRY_TYPE,
  replayRegistryEntries,
} from "./minimal-subagents/minimal-subagents-registry.js";
import { createCoordinatorToolSchemas } from "./minimal-subagents/minimal-subagents-tool-schemas.js";
import {
  findDeliveryEvidence,
  PiAgentSessionFactory,
} from "./minimal-subagents/minimal-subagents-sessions.js";
import { createCoordinatorToolDefinitions } from "./minimal-subagents/minimal-subagents-tools.js";
import type {
  CallerSnapshot,
  CoordinatorNotification,
  ForkSnapshot,
  RegistrySnapshot,
  RootConversationEndpoint,
} from "./minimal-subagents/minimal-subagents-types.js";

const EXTENSION_ENTRYPOINT = fileURLToPath(import.meta.url);

function currentConversationMessages(context: ExtensionContext): AgentMessage[] {
  const entries = context.sessionManager.getEntries() as SessionEntry[];
  const messages = buildSessionContext(entries, context.sessionManager.getLeafId()).messages;
  return snapshotCommittedContext(messages, !context.isIdle());
}

function rootCallerSnapshot(pi: ExtensionAPI, context: ExtensionContext): CallerSnapshot {
  if (!context.model) throw new Error("Minimal subagents spawn: root has no effective model");
  const activeTools = excludeCoordinatorTools(pi.getActiveTools());
  const availableTools = excludeCoordinatorTools(pi.getAllTools().map((tool) => tool.name));
  return {
    messages: currentConversationMessages(context),
    model: `${context.model.provider}/${context.model.id}`,
    thinkingLevel: context.thinkingLevel ?? pi.getThinkingLevel(),
    ordinaryTools: activeTools,
    capabilityCeiling: availableTools,
    availableTools,
    spawnEntryId: context.sessionManager.getLeafId() ?? "root",
  };
}

function createRootConversationEndpoint(
  pi: ExtensionAPI,
  context: ExtensionContext,
): RootConversationEndpoint {
  return {
    isRunning: () => !context.isIdle(),
    async deliverMessage(message, behavior) {
      pi.sendMessage(
        {
          customType: message.customType,
          content: message.content,
          display: true,
          details: message.details,
        },
        {
          triggerTurn: true,
          deliverAs: behavior === "follow-up" ? "followUp" : "steer",
        },
      );
    },
    hasDeliveryEvidence: (sourceAgentId, sourceTurnId) =>
      findDeliveryEvidence(context.sessionManager.getEntries(), sourceAgentId, sourceTurnId),
  };
}

function notificationLevel(notification: CoordinatorNotification): "info" | "warning" | "error" {
  if (notification.type === "failure" || notification.type === "fork-clone-failure") return "error";
  if (
    notification.type === "cancellation" ||
    notification.type === "interruption" ||
    notification.type === "unavailable"
  ) {
    return "warning";
  }
  return "info";
}

function hasHistoricalChildIdentity(entries: readonly SessionEntry[]): boolean {
  return entries.some(
    (entry) => entry.type === "custom" && entry.customType === CHILD_IDENTITY_ENTRY_TYPE,
  );
}

function replayPreviousRoot(previousSessionFile: string): RegistrySnapshot {
  const previousSession = SessionManager.open(previousSessionFile);
  const previousRootSessionId = previousSession.getSessionId();
  return replayRegistryEntries(previousSession.getEntries(), previousRootSessionId);
}

/** Register the six root coordinator tools and bind root-owned persistent subagent lifecycle hooks. */
export default function minimalSubagentsExtension(pi: ExtensionAPI) {
  let coordinator: MinimalSubagentsCoordinator | undefined;
  let preparedFork: ForkSnapshot | undefined;

  pi.on("session_start", async (event, context) => {
    const rootSessionId = context.sessionManager.getSessionId();
    const agentDir = getAgentDir();
    const enabledModelPatterns = SettingsManager.create(context.cwd, agentDir, {
      projectTrusted: context.isProjectTrusted(),
    }).getEnabledModels();
    const availableModels = context.modelRegistry.getAvailable();
    const eligibleModelIds = buildEligibleModelIds({
      availableModels,
      scopedModels: context.scopedModels,
      scopeConfigured: enabledModelPatterns !== undefined,
    });
    const models = [...availableModels];
    if (
      context.model &&
      !models.some(
        (model) => model.provider === context.model?.provider && model.id === context.model?.id,
      )
    ) {
      models.push(context.model);
    }
    const availableToolNames = excludeCoordinatorTools(pi.getAllTools().map((tool) => tool.name));
    const schemas = createCoordinatorToolSchemas(eligibleModelIds);
    let activeCoordinator!: MinimalSubagentsCoordinator;
    const sessionFactory = new PiAgentSessionFactory({
      cwd: context.cwd,
      agentDir,
      sessionDir: context.sessionManager.getSessionDir(),
      rootSessionId,
      extensionEntrypoint: EXTENSION_ENTRYPOINT,
      models,
      eligibleModelIds,
      modelScopeRestricted: enabledModelPatterns !== undefined,
      availableToolNames,
      projectTrusted: context.isProjectTrusted(),
      onChildSessionActivity: () => activeCoordinator.scheduleDeliveryReconciliation(),
      getCoordinatorTools: (callerId) =>
        createCoordinatorToolDefinitions({
          coordinator: activeCoordinator,
          callerId,
          schemas,
          captureCaller: (childContext) =>
            activeCoordinator.snapshotChildCaller(
              callerId,
              childContext.sessionManager.getLeafId() ?? callerId,
            ),
        }),
    });
    activeCoordinator = new MinimalSubagentsCoordinator({
      sessions: sessionFactory,
      root: createRootConversationEndpoint(pi, context),
      registry: {
        rootSessionId,
        append: (registryEvent) => pi.appendEntry(REGISTRY_ENTRY_TYPE, registryEvent),
      },
      notify: (notification) =>
        context.ui.notify(notification.message, notificationLevel(notification)),
    });
    coordinator = activeCoordinator;

    let snapshot: RegistrySnapshot;
    if (event.reason === "fork" && event.previousSessionFile) {
      let forkSnapshot = takeForkSnapshot(event.previousSessionFile);
      if (!forkSnapshot) {
        await activeCoordinator.restore(replayPreviousRoot(event.previousSessionFile));
        forkSnapshot = await activeCoordinator.prepareFork(event.previousSessionFile);
      }
      snapshot = forkSnapshot;
    } else {
      snapshot = replayRegistryEntries(context.sessionManager.getEntries(), rootSessionId);
    }
    await activeCoordinator.restore(snapshot);
    activeCoordinator.writeCheckpoint();

    const rootTools = createCoordinatorToolDefinitions({
      coordinator: activeCoordinator,
      callerId: "root",
      schemas,
      captureCaller: (toolContext) => rootCallerSnapshot(pi, toolContext),
    });
    for (const tool of rootTools) pi.registerTool(tool);
    pi.setActiveTools([...new Set([...pi.getActiveTools(), ...COORDINATOR_TOOL_NAMES])]);

    if (hasHistoricalChildIdentity(context.sessionManager.getEntries() as SessionEntry[])) {
      context.ui.notify(
        "Opened a former subagent session directly. It is now an independent root; former descendants and parent messaging were not restored. Concurrent ownership by its original root is unsupported.",
        "warning",
      );
    }
  });

  pi.on("session_before_fork", async (_event, context) => {
    const sessionFile = context.sessionManager.getSessionFile();
    if (!coordinator || !sessionFile) return;
    preparedFork = await coordinator.prepareFork(sessionFile);
    rememberForkSnapshot(preparedFork);
  });

  pi.on("message_end", async (event) => {
    if (!coordinator) return;
    if (event.message.role === "toolResult" || event.message.role === "custom") {
      await coordinator.reconcileDeliveries();
    }
  });

  pi.on("session_shutdown", async () => {
    await coordinator?.shutdown();
    coordinator = undefined;
    preparedFork = undefined;
  });
}
