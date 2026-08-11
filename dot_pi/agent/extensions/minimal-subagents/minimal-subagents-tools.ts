import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  truncateHead,
  type AgentToolResult,
  type ExtensionContext,
  type Theme,
  type ToolDefinition,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { MinimalSubagentsCoordinator } from "./minimal-subagents-coordinator.js";
import {
  renderCoordinatorToolCall,
  renderCoordinatorToolResult,
  type CoordinatorToolName,
} from "./minimal-subagents-rendering.js";
import type { createCoordinatorToolSchemas } from "./minimal-subagents-tool-schemas.js";
import type {
  CallerSnapshot,
  MessageBehavior,
  SpawnParameters,
} from "./minimal-subagents-types.js";

interface CoordinatorToolDefinitionOptions {
  coordinator: MinimalSubagentsCoordinator;
  callerId: string;
  allowSpawn?: boolean;
  schemas: ReturnType<typeof createCoordinatorToolSchemas>;
  captureCaller: (context: ExtensionContext) => CallerSnapshot;
  onActivity?: () => void;
  onAttention?: (message: string) => void;
}

async function runCoordinatorToolActivity<T>(
  options: CoordinatorToolDefinitionOptions,
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    return await operation();
  } finally {
    options.onActivity?.();
  }
}

function createCoordinatorToolRendering(toolName: CoordinatorToolName) {
  return {
    renderCall: (args: Record<string, unknown>, theme: Theme) =>
      renderCoordinatorToolCall(toolName, args, theme),
    renderResult: (
      result: AgentToolResult<unknown>,
      renderOptions: ToolRenderResultOptions,
      theme: Theme,
      context: { args: Record<string, unknown>; isError: boolean },
    ) =>
      renderCoordinatorToolResult(
        toolName,
        result,
        renderOptions,
        theme,
        context.args,
        context.isError,
      ),
  };
}

function structuredToolResult(result: unknown) {
  const json = JSON.stringify(result, null, 2);
  const truncated = truncateHead(json, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  return {
    content: [{ type: "text" as const, text: truncated.content }],
    details: result,
  };
}

function failedStructuredOperation(prefix: string, result: unknown): never {
  const json = JSON.stringify(result);
  const truncated = truncateHead(json, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  throw new Error(`${prefix}: ${truncated.content}`);
}

function callerSourceTurnId(
  coordinator: MinimalSubagentsCoordinator,
  callerId: string,
  toolCallId: string,
): string {
  if (callerId === "root") return `root:${toolCallId}`;
  const status = coordinator.status(callerId);
  return "agent" in status && status.agent.active_turn_id
    ? status.agent.active_turn_id
    : `${callerId}:${toolCallId}`;
}

/** Create caller-bound definitions for the six coordinator tools shared by root and children. */
export function createCoordinatorToolDefinitions(
  options: CoordinatorToolDefinitionOptions,
): ToolDefinition[] {
  const spawnTool = defineTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Create a persistent nested agent asynchronously. Returns its canonical agent ID and active turn ID immediately.",
    promptSnippet: "Spawn a persistent parallel or nested child conversation",
    parameters: options.schemas.subagent,
    async execute(_toolCallId, parameters, _signal, _onUpdate, context) {
      return runCoordinatorToolActivity(options, async () => {
        const result = await options.coordinator.spawn(
          options.callerId,
          parameters as SpawnParameters,
          options.captureCaller(context),
        );
        const status = options.coordinator.status(result.agent_id);
        return {
          ...structuredToolResult(result),
          details: {
            ...result,
            ...(status && "agent" in status ? { agent: status.agent } : {}),
          },
        };
      });
    },
    ...createCoordinatorToolRendering("subagent"),
  });

  const messageTool = defineTool({
    name: "subagent_message",
    label: "Subagent Message",
    description:
      "Send a visible conversation-plane message to a canonical agent ID, parent alias, or * broadcast snapshot.",
    promptSnippet: "Message a parent, child, peer, or all same-root agents",
    parameters: options.schemas.subagent_message,
    async execute(toolCallId, parameters) {
      return runCoordinatorToolActivity(options, async () => {
        const result = await options.coordinator.message(
          options.callerId,
          {
            agent_id: parameters.agent_id,
            message: parameters.message,
            behavior: parameters.behavior as MessageBehavior | undefined,
          },
          callerSourceTurnId(options.coordinator, options.callerId, toolCallId),
        );
        const successful = result.deliveries.filter((delivery) => delivery.delivered).length;
        if (successful === 0) {
          failedStructuredOperation("Minimal subagents message delivery failed", result);
        }
        return structuredToolResult(result);
      });
    },
    ...createCoordinatorToolRendering("subagent_message"),
  });

  const waitTool = defineTool({
    name: "subagent_wait",
    label: "Subagent Wait",
    description:
      "Wait for the target's exact active turn, or return its latest settled turn immediately. Timeout never cancels the target.",
    promptSnippet: "Wait for one exact subagent turn",
    parameters: options.schemas.subagent_wait,
    async execute(_toolCallId, parameters, signal, onUpdate) {
      const startedAt = Date.now();
      const updateWaitingResult = () =>
        onUpdate?.({
          content: [{ type: "text", text: `Waiting for ${parameters.agent_id}` }],
          details: {
            agent_id: parameters.agent_id,
            status: "waiting",
            elapsed_ms: Date.now() - startedAt,
          },
        });
      updateWaitingResult();
      const waitingInterval = setInterval(updateWaitingResult, 1_000);
      waitingInterval.unref?.();
      try {
        return await runCoordinatorToolActivity(options, async () => {
          const result = await options.coordinator.wait(
            options.callerId,
            parameters.agent_id,
            parameters.timeout_ms,
            signal,
          );
          return {
            ...structuredToolResult(result),
            details: {
              ...result,
              source_agent_id: result.agent_id,
              source_turn_id: result.turn_id,
            },
          };
        });
      } finally {
        clearInterval(waitingInterval);
      }
    },
    ...createCoordinatorToolRendering("subagent_wait"),
  });

  const statusTool = defineTool({
    name: "subagent_status",
    label: "Subagent Status",
    description:
      "List the concise rooted hierarchy when agent_id is omitted, or inspect one agent's launch contract, result, usage, and dependencies.",
    promptSnippet: "Inspect persistent subagent hierarchy and state",
    parameters: options.schemas.subagent_status,
    async execute(_toolCallId, parameters) {
      return runCoordinatorToolActivity(options, () =>
        structuredToolResult(options.coordinator.status(parameters.agent_id)),
      );
    },
    ...createCoordinatorToolRendering("subagent_status"),
  });

  const cancelTool = defineTool({
    name: "subagent_cancel",
    label: "Subagent Cancel",
    description:
      "Abort active target work while preserving sessions for later continuation. Recursive cancellation defaults to true.",
    promptSnippet: "Cancel active subagent turns without deleting sessions",
    parameters: options.schemas.subagent_cancel,
    async execute(_toolCallId, parameters) {
      return runCoordinatorToolActivity(options, async () =>
        structuredToolResult(
          await options.coordinator.cancel(parameters.agent_id, parameters.recursive ?? true),
        ),
      );
    },
    ...createCoordinatorToolRendering("subagent_cancel"),
  });

  const deleteTool = defineTool({
    name: "subagent_delete",
    label: "Subagent Delete",
    description:
      "Delete persistent child sessions post-order and retain durable ID tombstones. Recursive deletion defaults to true.",
    promptSnippet: "Delete subagent sessions and tombstone their IDs",
    parameters: options.schemas.subagent_delete,
    async execute(_toolCallId, parameters) {
      return runCoordinatorToolActivity(options, async () => {
        const result = await options.coordinator.delete(
          parameters.agent_id,
          parameters.recursive ?? true,
        );
        if (result.failures.length > 0) {
          options.onAttention?.(
            `Minimal subagents deletion partially failed for ${parameters.agent_id}`,
          );
          failedStructuredOperation("Minimal subagents deletion partially failed", result);
        }
        return structuredToolResult(result);
      });
    },
    ...createCoordinatorToolRendering("subagent_delete"),
  });

  const coordinatorTools = [spawnTool, messageTool, waitTool, statusTool, cancelTool, deleteTool];
  const allowSpawn = options.allowSpawn ?? options.callerId === "root";
  return allowSpawn
    ? coordinatorTools
    : coordinatorTools.filter((tool) => tool.name !== "subagent");
}
