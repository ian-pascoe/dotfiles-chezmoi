import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

vi.mock("@oh-my-pi/pi-agent-core", () => ({
  ThinkingLevel: {
    Inherit: "inherit",
    Off: "off",
    Minimal: "minimal",
    Low: "low",
    Medium: "medium",
    High: "high",
    XHigh: "xhigh",
    Max: "max",
  },
}));
vi.mock("@oh-my-pi/pi-ai", () => ({
  THINKING_EFFORTS: ["minimal", "low", "medium", "high", "xhigh", "max"],
}));

import adaptiveThinking from "./adaptive-thinking";

const SELECTABLE_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
type SelectableThinkingLevel = (typeof SELECTABLE_THINKING_LEVELS)[number];
type ReportedThinkingLevel = SelectableThinkingLevel | "inherit";
type ModelEffort = Exclude<SelectableThinkingLevel, "off">;

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
    params: { level: SelectableThinkingLevel },
    signal: AbortSignal,
    onUpdate: undefined,
    ctx: unknown,
  ): Promise<ToolResult>;
};

type ThinkingLevelDetails = {
  requestedLevel: SelectableThinkingLevel;
  previousLevel: SelectableThinkingLevel | null;
  effectiveLevel: SelectableThinkingLevel | null;
  applied: boolean;
  effectiveChanged: boolean;
  supportedLevels?: SelectableThinkingLevel[];
};

type TestModel = {
  id: string;
  reasoning: boolean;
  thinking: {
    efforts: ModelEffort[];
  };
};

type BeforeAgentStartHandler = (
  event: {
    type: "before_agent_start";
    prompt: string;
    systemPrompt: string[];
  },
  ctx: { model: TestModel | undefined },
) => { systemPrompt?: string[] } | Promise<{ systemPrompt?: string[] } | undefined> | undefined;

type HarnessOptions = {
  initialLevel?: ReportedThinkingLevel | undefined;
  hasModel?: boolean;
  modelEfforts?: ModelEffort[];
  applyLevel?: (
    requested: SelectableThinkingLevel,
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
  const setCalls: SelectableThinkingLevel[] = [];
  let tool: ToolDefinition | undefined;
  let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;

  const z = {
    enum: (values: readonly string[]) => ({ values }),
    object: (shape: unknown) => ({ shape }),
  };

  adaptiveThinking({
    zod: { z },
    on(event: string, handler: BeforeAgentStartHandler) {
      if (event === "before_agent_start") beforeAgentStartHandler = handler;
    },
    registerTool(definition: ToolDefinition) {
      tool = definition;
    },
    getThinkingLevel() {
      return currentLevel;
    },
    setThinkingLevel(level: SelectableThinkingLevel) {
      setCalls.push(level);
      currentLevel = options.applyLevel ? options.applyLevel(level, currentLevel) : level;
    },
  } as never);

  assert.ok(tool);
  assert.equal(tool.approval, "read");
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
    async injectGuidance(systemPrompt: string[]) {
      assert.ok(beforeAgentStartHandler);
      const result = await beforeAgentStartHandler(
        {
          type: "before_agent_start",
          prompt: "test prompt",
          systemPrompt,
        },
        { model },
      );
      return result?.systemPrompt ?? systemPrompt;
    },
    execute(level: SelectableThinkingLevel) {
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
    assert.deepEqual(tool.parameters.shape.level.values, SELECTABLE_THINKING_LEVELS);
    assert.match(tool.description, /during a coding-agent run/i);
    assert.match(tool.description, /initial checkpoint/i);
    assert.match(tool.description, /phase or evidence changes/i);
    assert.match(tool.description, /escalate.*failing tests.*ambiguity.*high-risk/i);
    assert.match(tool.description, /de-escalate.*known.*mechanical/i);
    assert.match(tool.description, /persists.*long-running work.*revisit/i);
  });

  test("appends concise decision guidance without replacing existing prompt blocks", async () => {
    const harness = createHarness({
      initialLevel: "medium",
      modelEfforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
    });

    const promptBlocks = await harness.injectGuidance(["Base prompt", "Existing policy"]);

    assert.deepEqual(promptBlocks.slice(0, 2), ["Base prompt", "Existing policy"]);
    const guidance = promptBlocks.at(-1);
    assert.ok(guidance);
    assert.match(guidance, /Thinking effort policy:/i);
    assert.match(guidance, /Current: medium/i);
    assert.match(guidance, /match.*current phase.*not the entire task/i);
    assert.match(guidance, /initial checkpoint/i);
    assert.match(guidance, /target differs from Current.*call set_thinking_level/i);
    assert.match(guidance, /Current.*provider default.*unknown.*call set_thinking_level/i);
    assert.match(guidance, /Do not call.*target equals Current/i);
    assert.match(guidance, /Long-running tasks.*reassess throughout the run/i);
    assert.match(guidance, /phase transition.*exploration.*implementation.*verification/i);
    assert.match(guidance, /unexpected evidence.*test failure.*tool error.*conflicting/i);
    assert.match(guidance, /before.*high-risk.*after.*uncertainty.*resolved/i);
    assert.match(guidance, /Escalate.*repeated failed hypotheses.*unfamiliar/i);
    assert.match(guidance, /De-escalate.*known-path.*mechanical/i);
    assert.match(guidance, /target MUST be one of the exact values listed in Available/i);
    assert.match(guidance, /low:.*known-path.*targeted lookup.*known test/i);
    assert.match(guidance, /medium:.*routine implementation.*test writing.*integration/i);
    assert.match(guidance, /high:.*debugging.*ambiguous.*risky/i);
    assert.match(guidance, /xhigh:.*architecture.*migration.*concurrency.*security/i);
    assert.match(guidance, /max:.*exceptionally difficult.*high-consequence/i);
    assert.match(guidance, /persists.*actively revisit/i);
    assert.match(guidance, /do not churn.*individual tool call/i);
    assert.match(guidance, /between adjacent levels.*prefer the lower/i);
  });

  test("reports provider default and the active model effort set", async () => {
    const harness = createHarness({
      initialLevel: "inherit",
      modelEfforts: ["high", "xhigh"],
    });

    const promptBlocks = await harness.injectGuidance([]);
    const guidance = promptBlocks.at(-1);

    assert.ok(guidance);
    assert.match(guidance, /Current: provider default \(unknown\)/i);
    assert.match(guidance, /Available: off, high, xhigh/i);
    assert.doesNotMatch(guidance, /  - medium:/i);
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

  test("sets max when the active model advertises it", async () => {
    const harness = createHarness({
      initialLevel: "xhigh",
      modelEfforts: ["xhigh", "max"],
    });

    const result = await harness.execute("max");

    assert.deepEqual(harness.setCalls, ["max"]);
    assert.equal(result.isError, undefined);
    assert.deepEqual(details(result), {
      requestedLevel: "max",
      previousLevel: "xhigh",
      effectiveLevel: "max",
      applied: true,
      effectiveChanged: true,
    });
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
