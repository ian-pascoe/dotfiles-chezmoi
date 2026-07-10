import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

type LevelDetails = {
  requestedLevel: ThinkingLevel;
  previousLevel: ThinkingLevel | null;
  effectiveLevel: ThinkingLevel | null;
  applied: boolean;
  effectiveChanged: boolean;
  supportedLevels?: ThinkingLevel[];
};

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

function normalizeReportedLevel(value: unknown): ThinkingLevel | null {
  return isThinkingLevel(value) ? value : null;
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
      level: z.enum(THINKING_LEVELS),
    }),
    async execute(_toolCallId, { level }, _signal, _onUpdate, ctx) {
      const previousLevel = pi.getThinkingLevel();
      const normalizedPreviousLevel = normalizeReportedLevel(previousLevel);
      const modelEfforts = ctx.model?.thinking?.efforts ?? [];
      const supportedLevels: ThinkingLevel[] = ["off", ...modelEfforts.filter(isThinkingLevel)];

      const baseDetails = {
        requestedLevel: level,
        previousLevel: normalizedPreviousLevel,
        effectiveLevel: normalizedPreviousLevel,
        applied: false,
        effectiveChanged: false,
      } satisfies LevelDetails;

      if (!ctx.model && level !== "off") {
        return textResult(
          `Cannot set thinking level to ${level}: ` +
            "no active model is available to verify support.",
          { ...baseDetails, supportedLevels: ["off"] },
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
