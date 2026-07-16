import { ThinkingLevel, type ResolvedThinkingLevel } from "@oh-my-pi/pi-agent-core";
import { THINKING_EFFORTS, type Model } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const SELECTABLE_THINKING_LEVELS = [ThinkingLevel.Off, ...THINKING_EFFORTS] as const;

type LevelDetails = {
  requestedLevel: ResolvedThinkingLevel;
  previousLevel: ResolvedThinkingLevel | null;
  effectiveLevel: ResolvedThinkingLevel | null;
  applied: boolean;
  effectiveChanged: boolean;
  supportedLevels?: ResolvedThinkingLevel[];
  reason?: string;
};

function supportedThinkingLevels(model: Model | undefined): ResolvedThinkingLevel[] {
  return [ThinkingLevel.Off, ...(model?.thinking?.efforts ?? [])];
}

const LEVEL_GUIDANCE: Record<ResolvedThinkingLevel, string> = {
  [ThinkingLevel.Off]: "rote continuation after the next action is fully determined",
  [ThinkingLevel.Minimal]: "a tiny explicit edit or lookup with negligible uncertainty",
  [ThinkingLevel.Low]: "known-path mechanical edits, targeted lookup, or rerunning a known test",
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
    "- Objective: Match effort to the current phase, not the entire task. A long coding task can legitimately move through several levels.",
    "- Initial checkpoint: Before the first substantive action on a new user task, select the lowest adequate target. If the target differs from Current, call set_thinking_level before continuing.",
    "- Unknown current: If Current is provider default (unknown), call set_thinking_level at the initial checkpoint to guarantee the target.",
    "- No-op rule: Do not call set_thinking_level when the selected target equals Current.",
    "- Long-running tasks: Reassess throughout the run; the initial choice is not a task-wide commitment.",
    "- Reassessment checkpoints:",
    "  - At a phase transition: exploration → implementation → verification, or when returning to diagnosis.",
    "  - After unexpected evidence such as a test failure, tool error, conflicting requirements, an ambiguous API, or a failed fix.",
    "  - Before a high-risk or hard-to-reverse decision, and after its uncertainty has been resolved.",
    "- Adjustment rule: When a checkpoint changes the lowest adequate target, call set_thinking_level before the next substantive reasoning or tool call and include a concise reason naming the checkpoint or evidence.",
    "- Escalate for repeated failed hypotheses, unfamiliar subsystems, broad ambiguity, architecture, security, concurrency, or migration risk.",
    "- De-escalate once uncertainty is resolved and the remaining work is known-path, mechanical, or routine verification.",
    "- Selection rule: The target MUST be one of the exact values listed in Available; never invent an unavailable intermediate level.",
    "- Scale:",
    ...supportedLevels.map((level) => `  - ${level}: ${LEVEL_GUIDANCE[level]}.`),
    "- Persistence: A successful call persists the exact level for subsequent model calls and disables automatic selection, so actively revisit it during long-running work.",
    "- Stability: Adjust at meaningful phase or evidence boundaries; do not churn levels for every individual tool call.",
    "- Tie-breaker: When deciding between adjacent levels, prefer the lower one unless extra reasoning could materially improve correctness.",
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

function textResult(text: string, details: LevelDetails, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    ...(isError ? { isError: true } : {}),
  };
}

export default function adaptiveThinking(pi: ExtensionAPI): void {
  const { z } = pi.zod;

  pi.on("before_agent_start", (event, ctx) => {
    const currentLevel = normalizeReportedLevel(pi.getThinkingLevel());
    const supportedLevels = supportedThinkingLevels(ctx.model);
    return {
      systemPrompt: [...event.systemPrompt, steeringGuidance(currentLevel, supportedLevels)],
    };
  });

  pi.registerTool({
    name: "set_thinking_level",
    label: "Set Thinking Level",
    approval: "read",
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
}
