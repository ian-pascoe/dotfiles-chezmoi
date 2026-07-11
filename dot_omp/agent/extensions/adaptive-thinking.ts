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
};

function supportedThinkingLevels(model: Model | undefined): ResolvedThinkingLevel[] {
  return [ThinkingLevel.Off, ...(model?.thinking?.efforts ?? [])];
}

function steeringGuidance(
  currentLevel: ResolvedThinkingLevel | null,
  supportedLevels: ResolvedThinkingLevel[],
): string {
  return [
    "You MUST manage thinking level deliberately.",
    "Choose the lowest level that is adequate for the current work.",
    `Current effective thinking level: ${currentLevel ?? "provider default"}.`,
    `Available exact levels for the active model: ${supportedLevels.join(", ")}.`,
    "Use off/minimal for trivial, clerical, or mechanical work; low/medium for routine coding and straightforward analysis; high/xhigh/max for ambiguity, debugging, risky changes, architecture, or multi-step synthesis.",
    "Reassess at turn start, after meaningful new evidence, and whenever task complexity shifts.",
    "Use set_thinking_level only when intentionally selecting an explicit level for the session.",
    "A successful call exits automatic selection.",
    "If the current effective level already matches the target, call only when intentionally pinning automatic selection to that exact level.",
    "Avoid repeated set_thinking_level calls without new evidence or a task change.",
  ].join(" ");
}

function isResolvedThinkingLevel(value: unknown): value is ResolvedThinkingLevel {
  return (
    typeof value === "string" &&
    (SELECTABLE_THINKING_LEVELS as readonly string[]).includes(value)
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
    approval: "write",
    description: [
      "Set an exact thinking level for subsequent model calls in this OMP session.",
      "The explicit level remains active until the model or user changes it.",
      "A successful call replaces automatic selection for this session.",
    ].join(" "),
    parameters: z.object({
      level: z.enum(SELECTABLE_THINKING_LEVELS),
    }),
    async execute(_toolCallId, { level }, _signal, _onUpdate, ctx) {
      const previousLevel = pi.getThinkingLevel();
      const normalizedPreviousLevel = normalizeReportedLevel(previousLevel);
      const supportedLevels = supportedThinkingLevels(ctx.model);

      const baseDetails = {
        requestedLevel: level,
        previousLevel: normalizedPreviousLevel,
        effectiveLevel: normalizedPreviousLevel,
        applied: false,
        effectiveChanged: false,
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
        requestedLevel: level,
        previousLevel: normalizedPreviousLevel,
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

      return textResult(
        `Thinking level explicitly set to ${effectiveLevelText} for this session.`,
        details,
      );
    },
  });
}
