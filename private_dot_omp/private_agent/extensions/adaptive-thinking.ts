import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { ThinkingLevel, type ResolvedThinkingLevel } from "@oh-my-pi/pi-agent-core";
import { THINKING_EFFORTS, type Model } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

const SELECTABLE_THINKING_LEVELS = [ThinkingLevel.Off, ...THINKING_EFFORTS] as const;
const ADAPTIVE_THINKING_TOOL_NAME = "set_thinking_level";
const ADAPTIVE_THINKING_TOGGLE_TOOL_NAME = "toggle_adaptive_thinking";
const ADAPTIVE_THINKING_SESSION_ENTRY_TYPE = "adaptive-thinking-session";
const ADAPTIVE_THINKING_PROCESS_REGISTRY_KEY = Symbol.for(
  "oh-my-pi:adaptive-thinking:session-tree-registry",
);
const ADAPTIVE_THINKING_FIRST_ARGUMENT_COMPLETIONS = [
  { label: "on", value: "on", description: "Enable for this session" },
  { label: "off", value: "off", description: "Disable for this session" },
  { label: "session", value: "session", description: "Change this session" },
  { label: "global", value: "global", description: "Change the global default" },
  {
    label: "agent-toggle",
    value: "agent-toggle",
    description: "Change whether agents can toggle adaptive thinking",
  },
];
const ADAPTIVE_THINKING_SCOPED_ARGUMENT_COMPLETIONS = [
  { label: "session on", value: "session on", description: "Enable for this session" },
  { label: "session off", value: "session off", description: "Disable for this session" },
  { label: "global on", value: "global on", description: "Enable globally" },
  { label: "global off", value: "global off", description: "Disable globally" },
  {
    label: "agent-toggle on",
    value: "agent-toggle on",
    description: "Allow agents to toggle adaptive thinking",
  },
  {
    label: "agent-toggle off",
    value: "agent-toggle off",
    description: "Prevent agents from toggling adaptive thinking",
  },
];

type LevelDetails = {
  requestedLevel: ResolvedThinkingLevel;
  previousLevel: ResolvedThinkingLevel | null;
  effectiveLevel: ResolvedThinkingLevel | null;
  applied: boolean;
  effectiveChanged: boolean;
  supportedLevels?: ResolvedThinkingLevel[];
  reason?: string;
};
type AdaptiveThinkingSettings = {
  enabled: boolean;
  allowAgentToggle: boolean;
};

type AdaptiveThinkingToggleDetails = {
  requestedEnabled: boolean;
  previousEnabled: boolean;
  effectiveEnabled: boolean;
  requestedLevel: ResolvedThinkingLevel | null;
  previousLevel: ResolvedThinkingLevel | null;
  effectiveLevel: ResolvedThinkingLevel | null;
  applied: boolean;
  reason: string;
};

type AdaptiveThinkingCommand =
  | {
      target: "adaptive-thinking";
      scope: "session" | "global";
      enabled: boolean | undefined;
    }
  | {
      target: "agent-toggle";
      enabled: boolean | undefined;
    };
type AdaptiveThinkingSessionMode = {
  enabled: boolean;
  allowAgentToggle: boolean;
};

type AdaptiveThinkingSessionApplication = (mode: AdaptiveThinkingSessionMode) => Promise<void>;

type AdaptiveThinkingSessionTreeState = AdaptiveThinkingSessionMode & {
  owner: symbol | null;
  applications: Set<AdaptiveThinkingSessionApplication>;
};

function isAdaptiveThinkingSessionTreeState(
  value: unknown,
): value is AdaptiveThinkingSessionTreeState {
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    typeof value.enabled === "boolean" &&
    "allowAgentToggle" in value &&
    typeof value.allowAgentToggle === "boolean" &&
    "owner" in value &&
    (typeof value.owner === "symbol" || value.owner === null) &&
    "applications" in value &&
    value.applications instanceof Set
  );
}

function getAdaptiveThinkingSessionTreeState(
  settingsPath: string,
  initialSettings: AdaptiveThinkingSettings,
): AdaptiveThinkingSessionTreeState {
  const storedRegistry: unknown = Reflect.get(globalThis, ADAPTIVE_THINKING_PROCESS_REGISTRY_KEY);
  // SAFETY: This private global symbol is written only here. Values are still validated before use.
  const registry =
    storedRegistry instanceof Map
      ? (storedRegistry as Map<unknown, unknown>)
      : new Map<unknown, unknown>();
  if (!(storedRegistry instanceof Map)) {
    Reflect.set(globalThis, ADAPTIVE_THINKING_PROCESS_REGISTRY_KEY, registry);
  }

  const storedState: unknown = registry.get(settingsPath);
  if (isAdaptiveThinkingSessionTreeState(storedState)) return storedState;

  const state: AdaptiveThinkingSessionTreeState = {
    enabled: initialSettings.enabled,
    allowAgentToggle: initialSettings.allowAgentToggle,
    owner: null,
    applications: new Set(),
  };
  registry.set(settingsPath, state);
  return state;
}

function supportedThinkingLevels(model: Model | undefined): ResolvedThinkingLevel[] {
  return [ThinkingLevel.Off, ...(model?.thinking?.efforts ?? [])];
}

const LEVEL_GUIDANCE: Record<ResolvedThinkingLevel, string> = {
  [ThinkingLevel.Off]: "rote continuation after the next action is fully determined",
  [ThinkingLevel.Minimal]: "a tiny explicit edit or lookup with negligible uncertainty",
  [ThinkingLevel.Low]:
    "predictable result interpretation or known-path mechanical work with negligible diagnostic uncertainty",
  [ThinkingLevel.Medium]:
    "routine implementation, test writing, integration, or bounded multi-file changes",
  [ThinkingLevel.High]:
    "debugging failures, ambiguous requirements, unfamiliar code, or reviewing a risky change",
  [ThinkingLevel.XHigh]:
    "architecture, migrations, concurrency, security, cross-system reasoning, or repeated failed hypotheses",
  [ThinkingLevel.Max]:
    "exceptionally difficult or high-consequence work where exhaustive reasoning is justified",
};

function steeringGuidance(
  currentLevel: ResolvedThinkingLevel | null,
  supportedLevels: ResolvedThinkingLevel[],
): string {
  return [
    "Thinking effort policy:",
    `- Current: ${currentLevel ?? "provider default (unknown)"}.`,
    `- Available: ${supportedLevels.join(", ")}.`,
    "- Objective: Choose effort for the reasoning required by the next model call, including how it will interpret the expected tool result or make the next decision; do not choose from tool-command mechanics alone. A long task can legitimately use several levels.",
    "- Initial checkpoint: Before the first substantive action on a new user task, select the lowest adequate target. If the target differs from Current, call set_thinking_level before continuing.",
    "- Initial risk signals: Treat lease renewal, cancellation, abort races, guarded finalization, process termination, and similar state-machine coordination as concurrency before implementation.",
    "- Unknown current: If Current is provider default (unknown), call set_thinking_level at the initial checkpoint to guarantee the target.",
    "- No-op rule: Do not call set_thinking_level when the selected target equals Current.",
    "- Long-running tasks: Reassess throughout the run; the initial choice is not a task-wide commitment.",
    "- Reassessment checkpoints:",
    "  - At a phase transition: exploration → implementation → verification, or when returning to diagnosis.",
    "  - After unexpected evidence such as a test failure, tool error, conflicting requirements, an ambiguous API, or a failed fix.",
    "  - Before a high-risk or hard-to-reverse decision, and after its uncertainty has been resolved.",
    "- Adjustment rule: When a checkpoint changes the lowest adequate target, call set_thinking_level before the next substantive model inference and include a concise reason naming the checkpoint or evidence.",
    "- Escalate for repeated failed hypotheses, unfamiliar subsystems, broad ambiguity, architecture, security, concurrency, or migration risk.",
    "- De-escalate only after uncertainty is resolved and remaining reasoning is known-path. Low-effort verification requires a known, available check and no unresolved contract, type, or security uncertainty.",
    "- Verification rule: Do not de-escalate solely to invoke a verifier when a plausible failure would reopen diagnosis at the current level. If verification fails after a de-escalation, prior confidence is invalidated; reassess before the first diagnostic action.",
    "- Selection rule: The target MUST be one of the exact values listed in Available; never invent an unavailable intermediate level.",
    "- Scale:",
    ...supportedLevels.map((level) => `  - ${level}: ${LEVEL_GUIDANCE[level]}.`),
    "- Persistence: A successful call persists the exact level for subsequent model calls and disables automatic selection, so actively revisit it during long-running work.",
    "- Stability: Adjust at meaningful phase or evidence boundaries; do not churn levels for every individual tool call.",
    "- Tie-breaker: When deciding between adjacent levels, prefer the lower one unless extra reasoning could materially improve correctness.",
  ].join("\n");
}
function disabledAdaptiveThinkingGuidance(
  currentLevel: ResolvedThinkingLevel | null,
  supportedLevels: ResolvedThinkingLevel[],
): string {
  return [
    "Adaptive thinking is off.",
    `- Current thinking level: ${currentLevel ?? "provider default (unknown)"}.`,
    `- Available levels: ${supportedLevels.join(", ")}.`,
    "- Long-task rule: If the fixed thinking level is materially higher than the next phase requires and the task has substantial work remaining, call toggle_adaptive_thinking with enabled true and the lowest adequate level.",
    "- Short-task rule: Do not enable adaptive thinking for a short task or when the current level is already appropriate.",
    "- Scope: The tool changes only this session tree. It never changes the global default.",
  ].join("\n");
}

function isResolvedThinkingLevel(value: unknown): value is ResolvedThinkingLevel {
  return (
    typeof value === "string" && (SELECTABLE_THINKING_LEVELS as readonly string[]).includes(value)
  );
}

function normalizeReportedLevel(value: unknown): ResolvedThinkingLevel | null {
  return isResolvedThinkingLevel(value) ? value : null;
}

function textResult<TDetails>(text: string, details: TDetails, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError ? { isError: true } : {}),
  };
}

function readAdaptiveThinkingSettings(settingsPath: string): AdaptiveThinkingSettings {
  try {
    const settings: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (
      typeof settings !== "object" ||
      settings === null ||
      !("enabled" in settings) ||
      typeof settings.enabled !== "boolean"
    ) {
      throw new Error("Adaptive thinking settings require a boolean enabled value.");
    }
    const allowAgentToggle = "allowAgentToggle" in settings ? settings.allowAgentToggle : true;
    if (typeof allowAgentToggle !== "boolean") {
      throw new Error("Adaptive thinking settings require a boolean allowAgentToggle value.");
    }

    return {
      enabled: settings.enabled,
      allowAgentToggle,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { enabled: true, allowAgentToggle: true };
    }
    throw new Error(`Adaptive thinking settings could not be read from ${settingsPath}.`, {
      cause: error,
    });
  }
}

function parseAdaptiveThinkingCommand(args: string): AdaptiveThinkingCommand | null {
  const tokens = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens[0] === "agent-toggle") {
    if (tokens.length > 2) return null;
    const toggleState = tokens[1];
    if (toggleState !== undefined && toggleState !== "on" && toggleState !== "off") {
      return null;
    }
    return {
      target: "agent-toggle",
      enabled: toggleState === undefined ? undefined : toggleState === "on",
    };
  }
  if (tokens.length > 2) return null;

  let scope: "session" | "global" = "session";
  let enabled: boolean | undefined;
  let hasScope = false;

  for (const token of tokens) {
    if (token === "session" || token === "global") {
      if (hasScope) return null;
      scope = token;
      hasScope = true;
    } else if (token === "on" || token === "off") {
      if (enabled !== undefined) return null;
      enabled = token === "on";
    } else {
      return null;
    }
  }

  return { target: "adaptive-thinking", scope, enabled };
}

async function writeAdaptiveThinkingSettings(
  settingsPath: string,
  settings: AdaptiveThinkingSettings,
): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function readAdaptiveThinkingSessionEnabled(
  sessionManager: ExtensionContext["sessionManager"],
): boolean | undefined {
  let restoredEnabled: boolean | undefined;
  for (const entry of sessionManager.getEntries()) {
    if (
      entry.type !== "custom" ||
      entry.customType !== ADAPTIVE_THINKING_SESSION_ENTRY_TYPE ||
      typeof entry.data !== "object" ||
      entry.data === null ||
      !("enabled" in entry.data) ||
      typeof entry.data.enabled !== "boolean"
    ) {
      continue;
    }
    restoredEnabled = entry.data.enabled;
  }
  return restoredEnabled;
}

export default function adaptiveThinking(
  pi: ExtensionAPI,
  settingsPath = join(
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".omp", "agent"),
    "adaptive-thinking.json",
  ),
): void {
  const { z } = pi.zod;
  const extensionInstanceId = Symbol("adaptive-thinking-extension-instance");
  let adaptiveThinkingSettings = readAdaptiveThinkingSettings(settingsPath);
  let globalAdaptiveThinkingEnabled = adaptiveThinkingSettings.enabled;
  const sessionTreeState = getAdaptiveThinkingSessionTreeState(
    settingsPath,
    adaptiveThinkingSettings,
  );
  let adaptiveThinkingEnabled = sessionTreeState.enabled;

  const adaptiveThinkingCommandDescription = (): string => {
    const sessionState = adaptiveThinkingEnabled ? "on" : "off";
    const globalState = globalAdaptiveThinkingEnabled ? "on" : "off";
    const agentToggleState = adaptiveThinkingSettings.allowAgentToggle ? "on" : "off";
    return (
      `Adaptive thinking (session: ${sessionState}, global: ${globalState}, ` +
      `agent toggle: ${agentToggleState})`
    );
  };

  async function applyAdaptiveThinkingMode(mode: AdaptiveThinkingSessionMode): Promise<void> {
    adaptiveThinkingSettings = {
      ...adaptiveThinkingSettings,
      allowAgentToggle: mode.allowAgentToggle,
    };
    adaptiveThinkingEnabled = mode.enabled;
    registerAdaptiveThinkingCommand();

    const activeTools = pi.getActiveTools();
    const toolsWithoutAdaptiveThinking = activeTools.filter(
      (toolName) =>
        toolName !== ADAPTIVE_THINKING_TOOL_NAME && toolName !== ADAPTIVE_THINKING_TOGGLE_TOOL_NAME,
    );
    const nextActiveTools = [
      ...toolsWithoutAdaptiveThinking,
      ...(mode.allowAgentToggle ? [ADAPTIVE_THINKING_TOGGLE_TOOL_NAME] : []),
      ...(mode.enabled ? [ADAPTIVE_THINKING_TOOL_NAME] : []),
    ];
    await pi.setActiveTools(nextActiveTools);
  }
  sessionTreeState.applications.add(applyAdaptiveThinkingMode);

  async function applyAdaptiveThinkingSessionTreeState(): Promise<void> {
    const mode = {
      enabled: sessionTreeState.enabled,
      allowAgentToggle: sessionTreeState.allowAgentToggle,
    } satisfies AdaptiveThinkingSessionMode;
    await Promise.all([...sessionTreeState.applications].map((applyMode) => applyMode(mode)));
  }

  async function applyAdaptiveThinkingEnabledToSessionTree(enabled: boolean): Promise<void> {
    sessionTreeState.enabled = enabled;
    await applyAdaptiveThinkingSessionTreeState();
  }

  async function restoreAdaptiveThinkingSession(ctx: ExtensionContext): Promise<void> {
    const controlsSessionTree =
      ctx.hasUI ||
      sessionTreeState.owner === null ||
      sessionTreeState.owner === extensionInstanceId;
    if (controlsSessionTree) {
      sessionTreeState.owner = extensionInstanceId;
      sessionTreeState.allowAgentToggle = adaptiveThinkingSettings.allowAgentToggle;
      const sessionEnabled =
        readAdaptiveThinkingSessionEnabled(ctx.sessionManager) ?? globalAdaptiveThinkingEnabled;
      await applyAdaptiveThinkingEnabledToSessionTree(sessionEnabled);
      return;
    }

    await applyAdaptiveThinkingMode(sessionTreeState);
  }

  pi.on("before_agent_start", (event, ctx) => {
    const currentLevel = normalizeReportedLevel(pi.getThinkingLevel());
    const supportedLevels = supportedThinkingLevels(ctx.model);
    if (!adaptiveThinkingEnabled) {
      if (!adaptiveThinkingSettings.allowAgentToggle) return;
      return {
        systemPrompt: [
          ...event.systemPrompt,
          disabledAdaptiveThinkingGuidance(currentLevel, supportedLevels),
        ],
      };
    }

    return {
      systemPrompt: [...event.systemPrompt, steeringGuidance(currentLevel, supportedLevels)],
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    await restoreAdaptiveThinkingSession(ctx);
    ctx.ui.addAutocompleteProvider((current) => {
      const updateAdaptiveThinkingDescription = <
        T extends {
          items: Array<{ value: string; description?: string }>;
        } | null,
      >(
        result: T,
      ): T => {
        const commandItem = result?.items.find((item) => item.value === "adaptive-thinking");
        if (commandItem) {
          commandItem.description = adaptiveThinkingCommandDescription();
        }
        return result;
      };
      const getInlineHint = current.getInlineHint?.bind(current);
      const trySyncSlashCompletion = current.trySyncSlashCompletion?.bind(current);

      return {
        async getSuggestions(...args) {
          return updateAdaptiveThinkingDescription(await current.getSuggestions(...args));
        },
        applyCompletion: current.applyCompletion.bind(current),
        ...(getInlineHint ? { getInlineHint } : {}),
        ...(trySyncSlashCompletion
          ? {
              trySyncSlashCompletion(textBeforeCursor: string) {
                return updateAdaptiveThinkingDescription(trySyncSlashCompletion(textBeforeCursor));
              },
            }
          : {}),
      };
    });
  });

  pi.on("session_switch", async (_event, ctx) => {
    await restoreAdaptiveThinkingSession(ctx);
  });

  pi.on("session_branch", async (_event, ctx) => {
    await restoreAdaptiveThinkingSession(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    await restoreAdaptiveThinkingSession(ctx);
  });
  pi.on("session_shutdown", () => {
    sessionTreeState.applications.delete(applyAdaptiveThinkingMode);
    if (sessionTreeState.owner === extensionInstanceId) {
      sessionTreeState.owner = null;
    }
  });

  pi.registerTool({
    name: ADAPTIVE_THINKING_TOGGLE_TOOL_NAME,
    label: "Toggle Adaptive Thinking",
    approval: "read",
    defaultInactive: !adaptiveThinkingSettings.allowAgentToggle,
    description: [
      "Enable or disable adaptive thinking for the current session tree without changing the global default.",
      "Use enabled true during a long-running task when the fixed thinking level is materially higher than the next phase requires.",
      "When enabling, level is required and is applied immediately.",
      "When disabling, omit level; the current thinking level remains fixed.",
      "The explicit enabled target makes retries idempotent.",
    ].join(" "),
    parameters: z.object({
      enabled: z.boolean(),
      level: z.enum(SELECTABLE_THINKING_LEVELS).optional(),
      reason: z.string().describe("Concise reason for changing adaptive-thinking mode."),
    }),
    async execute(_toolCallId, { enabled, level, reason }, _signal, _onUpdate, ctx) {
      const previousEnabled = adaptiveThinkingEnabled;
      const previousLevel = normalizeReportedLevel(pi.getThinkingLevel());
      const baseDetails = {
        requestedEnabled: enabled,
        previousEnabled,
        effectiveEnabled: previousEnabled,
        requestedLevel: level ?? null,
        previousLevel,
        effectiveLevel: previousLevel,
        applied: false,
        reason,
      } satisfies AdaptiveThinkingToggleDetails;

      if (!adaptiveThinkingSettings.allowAgentToggle) {
        return textResult(
          "Agent adaptive-thinking toggles are disabled in global settings.",
          baseDetails,
          true,
        );
      }
      if (!enabled && level !== undefined) {
        return textResult(
          "Cannot disable adaptive thinking with a level. Omit level to keep the current thinking level fixed.",
          baseDetails,
          true,
        );
      }
      if (enabled && level === undefined) {
        return textResult("Cannot enable adaptive thinking without a level.", baseDetails, true);
      }

      if (enabled && level !== undefined) {
        const supportedLevels = supportedThinkingLevels(ctx.model);
        if (!ctx.model && level !== ThinkingLevel.Off) {
          return textResult(
            `Cannot enable adaptive thinking at ${level}: no active model is available to verify support.`,
            baseDetails,
            true,
          );
        }
        if (!supportedLevels.includes(level)) {
          return textResult(
            `Thinking level ${level} is not supported by ${ctx.model?.id ?? "the active model"}. Supported levels: ${supportedLevels.join(", ")}.`,
            baseDetails,
            true,
          );
        }

        pi.setThinkingLevel(level);
        if (pi.getThinkingLevel() !== level) {
          const effectiveLevel = normalizeReportedLevel(pi.getThinkingLevel());
          return textResult(
            `Cannot enable adaptive thinking: OMP applied ${effectiveLevel ?? "provider default"} instead of ${level}.`,
            { ...baseDetails, effectiveLevel },
            true,
          );
        }
      }

      pi.appendEntry(ADAPTIVE_THINKING_SESSION_ENTRY_TYPE, { enabled });
      await applyAdaptiveThinkingEnabledToSessionTree(enabled);
      const effectiveLevel = normalizeReportedLevel(pi.getThinkingLevel());
      return textResult(
        `Adaptive thinking ${enabled ? "enabled" : "disabled"} for this session tree. Thinking level: ${effectiveLevel ?? "provider default"}. Reason: ${reason}`,
        {
          ...baseDetails,
          effectiveEnabled: adaptiveThinkingEnabled,
          effectiveLevel,
          applied: adaptiveThinkingEnabled === enabled,
        } satisfies AdaptiveThinkingToggleDetails,
      );
    },
  });

  pi.registerTool({
    name: ADAPTIVE_THINKING_TOOL_NAME,
    label: "Set Thinking Level",
    approval: "read",
    defaultInactive: !adaptiveThinkingEnabled,
    description: [
      "Adjust the exact thinking level for subsequent model calls during a coding-agent run.",
      "Use it at the initial checkpoint when the current level is unknown or mismatched, and again whenever a phase or evidence changes the lowest adequate target.",
      "Escalate for failing tests, ambiguity, unfamiliar systems, or high-risk decisions; de-escalate once work becomes known-path and mechanical.",
      "The setting persists, so long-running work must actively revisit it at meaningful checkpoints instead of treating the first choice as task-wide.",
      "Choose a level supported by the active model, and do not call when the target already equals the current effective level.",
    ].join(" "),
    parameters: z.object({
      level: z.enum(SELECTABLE_THINKING_LEVELS),
      reason: z
        .string()
        .optional()
        .describe("Concise breadcrumb explaining why this effort level is appropriate now."),
    }),
    async execute(_toolCallId, { level, reason }, _signal, _onUpdate, ctx) {
      const previousLevel = pi.getThinkingLevel();
      const normalizedPreviousLevel = normalizeReportedLevel(previousLevel);
      const supportedLevels = supportedThinkingLevels(ctx.model);

      const baseDetails = {
        requestedLevel: level,
        previousLevel: normalizedPreviousLevel,
        effectiveLevel: normalizedPreviousLevel,
        applied: false,
        effectiveChanged: false,
        ...(reason === undefined ? {} : { reason }),
      } satisfies LevelDetails;
      if (!adaptiveThinkingEnabled) {
        return textResult(
          "Adaptive thinking is disabled. Run /adaptive-thinking to enable it.",
          baseDetails,
          true,
        );
      }

      if (!ctx.model && level !== ThinkingLevel.Off) {
        return textResult(
          `Cannot set thinking level to ${level}: ` +
            "no active model is available to verify support.",
          { ...baseDetails, supportedLevels: [ThinkingLevel.Off] },
          true,
        );
      }

      if (!supportedLevels.includes(level)) {
        return textResult(
          `Thinking level ${level} is not supported by ` +
            `${ctx.model?.id ?? "the active model"}. ` +
            `Supported levels: ${supportedLevels.join(", ")}.`,
          { ...baseDetails, supportedLevels },
          true,
        );
      }

      pi.setThinkingLevel(level);
      const effectiveLevel = pi.getThinkingLevel();
      const normalizedEffectiveLevel = normalizeReportedLevel(effectiveLevel);
      const effectiveLevelText = normalizedEffectiveLevel ?? "provider default";
      const details = {
        ...baseDetails,
        effectiveLevel: normalizedEffectiveLevel,
        applied: effectiveLevel === level,
        effectiveChanged: normalizedEffectiveLevel !== normalizedPreviousLevel,
      } satisfies LevelDetails;

      if (effectiveLevel !== level) {
        return textResult(
          `OMP applied ${effectiveLevelText} instead of ` +
            `the requested thinking level ${level}.`,
          details,
          true,
        );
      }

      const reasonSuffix = reason === undefined ? "" : ` Reason: ${reason}`;
      return textResult(
        `Thinking level explicitly set to ${effectiveLevelText} for this session.${reasonSuffix}`,
        details,
      );
    },
  });

  function registerAdaptiveThinkingCommand(): void {
    pi.registerCommand("adaptive-thinking", {
      description: adaptiveThinkingCommandDescription(),
      getArgumentCompletions(argumentPrefix) {
        const normalizedPrefix = argumentPrefix.trimStart().toLowerCase();
        const candidates = argumentPrefix.includes(" ")
          ? ADAPTIVE_THINKING_SCOPED_ARGUMENT_COMPLETIONS
          : ADAPTIVE_THINKING_FIRST_ARGUMENT_COMPLETIONS;
        const completions = candidates.filter((item) => item.value.startsWith(normalizedPrefix));
        return completions.length > 0 ? completions : null;
      },
      handler: async (args, ctx) => {
        const command = parseAdaptiveThinkingCommand(args);
        if (!command) {
          ctx.ui.notify(
            "Usage: /adaptive-thinking [session|global|agent-toggle] [on|off]",
            "warning",
          );
          return;
        }

        if (command.target === "agent-toggle") {
          const nextAllowed = command.enabled ?? !adaptiveThinkingSettings.allowAgentToggle;
          adaptiveThinkingSettings = {
            ...adaptiveThinkingSettings,
            allowAgentToggle: nextAllowed,
          };
          await writeAdaptiveThinkingSettings(settingsPath, adaptiveThinkingSettings);
          sessionTreeState.allowAgentToggle = nextAllowed;
          await applyAdaptiveThinkingSessionTreeState();
          ctx.ui.notify(
            `Agent adaptive-thinking toggle ${nextAllowed ? "enabled" : "disabled"} globally`,
            "info",
          );
          return;
        }

        const currentEnabled =
          command.scope === "global" ? globalAdaptiveThinkingEnabled : adaptiveThinkingEnabled;
        const nextEnabled = command.enabled ?? !currentEnabled;

        if (command.scope === "global") {
          adaptiveThinkingSettings = {
            ...adaptiveThinkingSettings,
            enabled: nextEnabled,
          };
          await writeAdaptiveThinkingSettings(settingsPath, adaptiveThinkingSettings);
          globalAdaptiveThinkingEnabled = nextEnabled;
        }

        pi.appendEntry(ADAPTIVE_THINKING_SESSION_ENTRY_TYPE, {
          enabled: nextEnabled,
        });
        await applyAdaptiveThinkingEnabledToSessionTree(nextEnabled);
        ctx.ui.notify(
          command.scope === "global"
            ? `Adaptive thinking ${nextEnabled ? "enabled" : "disabled"} globally`
            : `Adaptive thinking ${nextEnabled ? "enabled" : "disabled"} for this session`,
          "info",
        );
      },
    });
  }

  registerAdaptiveThinkingCommand();
}
