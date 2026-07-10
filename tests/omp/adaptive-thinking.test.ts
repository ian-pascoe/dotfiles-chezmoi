import assert from "node:assert/strict";
import { describe, test } from "vitest";

import adaptiveThinking from "../../dot_omp/agent/extensions/adaptive-thinking";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];
type ReportedThinkingLevel = ThinkingLevel | "inherit";

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
  isError?: boolean;
};

type ToolDefinition = {
  name: string;
  description: string;
  parameters: {
    shape: {
      level: {
        values: readonly string[];
      };
    };
  };
  approval?: string;
  execute(
    toolCallId: string,
    params: { level: ThinkingLevel },
    signal: AbortSignal,
    onUpdate: undefined,
    ctx: unknown,
  ): Promise<ToolResult>;
};

type ThinkingLevelDetails = {
  requestedLevel: ThinkingLevel;
  previousLevel: ThinkingLevel | null;
  effectiveLevel: ThinkingLevel | null;
  applied: boolean;
  effectiveChanged: boolean;
  supportedLevels?: ThinkingLevel[];
};

type HarnessOptions = {
  initialLevel?: ReportedThinkingLevel | undefined;
  hasModel?: boolean;
  modelEfforts?: ThinkingLevel[];
  applyLevel?: (
    requested: ThinkingLevel,
    current: ReportedThinkingLevel | undefined,
  ) => ReportedThinkingLevel | undefined;
};

function resultText(result: ToolResult): string {
  return result.content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("\n");
}

function details(result: ToolResult): ThinkingLevelDetails {
  assert.ok(result.details);
  return result.details as ThinkingLevelDetails;
}

function createHarness(options: HarnessOptions = {}) {
  let currentLevel = options.initialLevel;
  const setCalls: ThinkingLevel[] = [];
  let tool: ToolDefinition | undefined;

  const z = {
    enum: (values: readonly string[]) => ({ values }),
    object: (shape: unknown) => ({ shape }),
  };

  adaptiveThinking({
    zod: { z },
    registerTool(definition: ToolDefinition) {
      tool = definition;
    },
    getThinkingLevel() {
      return currentLevel;
    },
    setThinkingLevel(level: ThinkingLevel) {
      setCalls.push(level);
      currentLevel = options.applyLevel ? options.applyLevel(level, currentLevel) : level;
    },
  } as never);

  assert.ok(tool);
  assert.equal(tool.approval, "write");
  const registeredTool = tool;

  const model =
    options.hasModel === false
      ? undefined
      : {
          id: "test-model",
          reasoning: true,
          thinking: {
            efforts: options.modelEfforts ?? ["low", "medium", "high"],
          },
        };

  return {
    setCalls,
    tool: registeredTool,
    execute(level: ThinkingLevel) {
      return registeredTool.execute(
        "tool-call-1",
        { level },
        new AbortController().signal,
        undefined,
        { model },
      );
    },
  };
}

describe("OMP adaptive thinking extension", () => {
  test("registers the exact model-facing contract", () => {
    const { tool } = createHarness();

    assert.equal(tool.name, "set_thinking_level");
    assert.deepEqual(tool.parameters.shape.level.values, THINKING_LEVELS);
    assert.match(tool.description, /subsequent model calls in this OMP session/i);
    assert.match(tool.description, /remains active until the model or user changes it/i);
    assert.match(tool.description, /replaces automatic selection for this session/i);
  });

  test("sets a supported level and reports the effective change", async () => {
    const harness = createHarness({ initialLevel: "low" });

    const result = await harness.execute("high");

    assert.deepEqual(harness.setCalls, ["high"]);
    assert.equal(result.isError, undefined);
    assert.deepEqual(details(result), {
      requestedLevel: "high",
      previousLevel: "low",
      effectiveLevel: "high",
      applied: true,
      effectiveChanged: true,
    });
    assert.match(resultText(result), /explicitly set to high/i);
  });

  test("pins a same-effective selection", async () => {
    const harness = createHarness({ initialLevel: "medium" });

    const result = await harness.execute("medium");

    assert.deepEqual(harness.setCalls, ["medium"]);
    assert.deepEqual(details(result), {
      requestedLevel: "medium",
      previousLevel: "medium",
      effectiveLevel: "medium",
      applied: true,
      effectiveChanged: false,
    });
  });

  test("rejects an unsupported exact level before mutation", async () => {
    const harness = createHarness({
      initialLevel: "medium",
      modelEfforts: ["medium", "high"],
    });

    const result = await harness.execute("minimal");

    assert.deepEqual(harness.setCalls, []);
    assert.equal(result.isError, true);
    assert.deepEqual(details(result), {
      requestedLevel: "minimal",
      previousLevel: "medium",
      effectiveLevel: "medium",
      applied: false,
      effectiveChanged: false,
      supportedLevels: ["off", "medium", "high"],
    });
    assert.match(resultText(result), /supported levels: off, medium, high/i);
  });

  test("rejects non-off levels without an active model", async () => {
    const harness = createHarness({
      initialLevel: "low",
      hasModel: false,
    });

    const result = await harness.execute("high");

    assert.deepEqual(harness.setCalls, []);
    assert.equal(result.isError, true);
    assert.match(resultText(result), /no active model/i);
  });

  test("allows off without active model effort metadata", async () => {
    const harness = createHarness({
      initialLevel: "high",
      hasModel: false,
    });

    const result = await harness.execute("off");

    assert.deepEqual(harness.setCalls, ["off"]);
    assert.equal(result.isError, undefined);
    assert.equal(details(result).effectiveLevel, "off");
  });

  test("surfaces a post-set mismatch", async () => {
    const harness = createHarness({
      initialLevel: undefined,
      modelEfforts: ["high"],
      applyLevel: () => undefined,
    });

    const result = await harness.execute("high");

    assert.deepEqual(harness.setCalls, ["high"]);
    assert.equal(result.isError, true);
    assert.deepEqual(details(result), {
      requestedLevel: "high",
      previousLevel: null,
      effectiveLevel: null,
      applied: false,
      effectiveChanged: false,
    });
    assert.match(resultText(result), /provider default/i);
    assert.doesNotMatch(resultText(result), /undefined/i);
  });

  test("normalizes provider-default representation transitions", async () => {
    const harness = createHarness({
      initialLevel: "inherit",
      modelEfforts: ["high"],
      applyLevel: () => undefined,
    });

    const result = await harness.execute("high");

    assert.equal(result.isError, true);
    assert.deepEqual(details(result), {
      requestedLevel: "high",
      previousLevel: null,
      effectiveLevel: null,
      applied: false,
      effectiveChanged: false,
    });
  });

  test("normalizes an inherited previous level", async () => {
    const harness = createHarness({
      initialLevel: "inherit",
      modelEfforts: ["high"],
    });

    const result = await harness.execute("high");

    assert.deepEqual(details(result), {
      requestedLevel: "high",
      previousLevel: null,
      effectiveLevel: "high",
      applied: true,
      effectiveChanged: true,
    });
    assert.doesNotMatch(resultText(result), /undefined/i);
    assert.doesNotMatch(resultText(result), /inherit/i);
  });
});
