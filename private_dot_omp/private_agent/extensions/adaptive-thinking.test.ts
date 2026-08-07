import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, test, vi } from "vitest";

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

const TEST_SETTINGS_DIRECTORY = mkdtempSync(join(tmpdir(), "adaptive-thinking-"));
let harnessSequence = 0;

afterAll(() => {
  rmSync(TEST_SETTINGS_DIRECTORY, { recursive: true, force: true });
});

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
    shape: Record<
      string,
      {
        values?: readonly string[];
        description?: string;
      }
    >;
  };
  approval?: string;
  defaultInactive?: boolean;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate: undefined,
    ctx: unknown,
  ): Promise<ToolResult>;
};

type CommandDefinition = {
  description?: string;
  getArgumentCompletions?: (
    argumentPrefix: string,
  ) => Array<{ label: string; value: string; description?: string }> | null;
  handler(
    args: string,
    ctx: { ui: { notify(message: string, level: "info" | "warning"): void } },
  ): Promise<void>;
};

type ThinkingLevelDetails = {
  requestedLevel: SelectableThinkingLevel;
  previousLevel: SelectableThinkingLevel | null;
  effectiveLevel: SelectableThinkingLevel | null;
  applied: boolean;
  effectiveChanged: boolean;
  supportedLevels?: SelectableThinkingLevel[];
  reason?: string;
};
type AdaptiveThinkingToggleDetails = {
  requestedEnabled: boolean;
  previousEnabled: boolean;
  effectiveEnabled: boolean;
  requestedLevel: SelectableThinkingLevel | null;
  previousLevel: SelectableThinkingLevel | null;
  effectiveLevel: SelectableThinkingLevel | null;
  applied: boolean;
  reason: string;
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

type TestAutocompleteResult = {
  items: Array<{ value: string; label: string; description?: string }>;
  prefix: string;
} | null;

type TestAutocompleteProvider = {
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): Promise<TestAutocompleteResult>;
  applyCompletion(...args: unknown[]): unknown;
};

type TestAutocompleteProviderFactory = (
  current: TestAutocompleteProvider,
) => TestAutocompleteProvider;

type TestSessionEntry = {
  type: "custom";
  customType: string;
  data: unknown;
};

type SessionStartHandler = (
  event: { type: "session_start" },
  ctx: {
    hasUI: boolean;
    ui: {
      addAutocompleteProvider(factory: TestAutocompleteProviderFactory): void;
    };
    sessionManager: {
      getEntries(): TestSessionEntry[];
    };
  },
) => void | Promise<void>;
type TestEventHandler = (data: unknown) => void;

class TestEventBus {
  readonly #listeners = new Map<string, Set<TestEventHandler>>();

  emit(channel: string, data: unknown): void {
    for (const handler of this.#listeners.get(channel) ?? []) {
      handler(data);
    }
  }

  on(channel: string, handler: TestEventHandler): () => void {
    const handlers = this.#listeners.get(channel) ?? new Set<TestEventHandler>();
    handlers.add(handler);
    this.#listeners.set(channel, handlers);
    return () => {
      handlers.delete(handler);
    };
  }
}

type HarnessOptions = {
  initialLevel?: ReportedThinkingLevel | undefined;
  hasModel?: boolean;
  modelEfforts?: ModelEffort[];
  globallyEnabled?: boolean;
  allowAgentToggle?: boolean;
  sessionEntries?: TestSessionEntry[];
  events?: TestEventBus;
  hasUI?: boolean;
  settingsPath?: string;
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
function toggleDetails(result: ToolResult): AdaptiveThinkingToggleDetails {
  assert.ok(result.details);
  // SAFETY: The toggle tool result contract is the behavior under test.
  return result.details as AdaptiveThinkingToggleDetails;
}

function createHarness(options: HarnessOptions = {}) {
  const settingsPath =
    options.settingsPath ?? join(TEST_SETTINGS_DIRECTORY, `${harnessSequence++}.json`);
  const globallyEnabled = options.globallyEnabled ?? true;
  const allowAgentToggle = options.allowAgentToggle ?? false;
  writeFileSync(
    settingsPath,
    `${JSON.stringify({ enabled: globallyEnabled, allowAgentToggle })}\n`,
    "utf8",
  );
  const events = options.events ?? new TestEventBus();
  const hasUI = options.hasUI ?? true;

  let currentLevel = options.initialLevel;
  const setCalls: SelectableThinkingLevel[] = [];
  const tools = new Map<string, ToolDefinition>();
  let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;
  let sessionStartHandler: SessionStartHandler | undefined;
  const commands = new Map<string, CommandDefinition>();
  let activeTools = [
    "read",
    ...(allowAgentToggle ? ["toggle_adaptive_thinking"] : []),
    ...(globallyEnabled ? ["set_thinking_level"] : []),
  ];
  const sessionEntries = [...(options.sessionEntries ?? [])];
  const notifications: string[] = [];

  type TestStringSchema = {
    description?: string;
    optional(): TestStringSchema;
    describe(description: string): TestStringSchema;
  };
  const createStringSchema = (): TestStringSchema => {
    const schema: TestStringSchema = {
      optional: () => schema,
      describe(description) {
        schema.description = description;
        return schema;
      },
    };
    return schema;
  };

  const enumSchema = (values: readonly string[]) => ({
    values,
    optional() {
      return enumSchema(values);
    },
  });
  const z = {
    boolean: () => ({}),
    enum: enumSchema,
    string: createStringSchema,
    object: (shape: unknown) => ({ shape }),
  };

  adaptiveThinking(
    {
      zod: { z },
      events,
      on(event: string, handler: unknown) {
        if (event === "before_agent_start") {
          beforeAgentStartHandler = handler as BeforeAgentStartHandler;
        } else if (event === "session_start") {
          sessionStartHandler = handler as SessionStartHandler;
        }
      },
      registerTool(definition: ToolDefinition) {
        tools.set(definition.name, definition);
      },
      registerCommand(name: string, definition: CommandDefinition) {
        commands.set(name, definition);
      },
      getActiveTools() {
        return activeTools;
      },
      async setActiveTools(toolNames: string[]) {
        activeTools = toolNames;
      },
      appendEntry(customType: string, data: unknown) {
        sessionEntries.push({ type: "custom", customType, data });
      },
      getThinkingLevel() {
        return currentLevel;
      },
      setThinkingLevel(level: SelectableThinkingLevel) {
        setCalls.push(level);
        currentLevel = options.applyLevel ? options.applyLevel(level, currentLevel) : level;
      },
    } as never,
    settingsPath,
  );

  const registeredTool = tools.get("set_thinking_level");
  assert.ok(registeredTool);
  assert.equal(registeredTool.approval, "read");
  const registeredToggleTool = tools.get("toggle_adaptive_thinking");
  assert.ok(registeredToggleTool);
  assert.equal(registeredToggleTool.approval, "read");
  const command = commands.get("adaptive-thinking");
  assert.ok(command);

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
    toggleTool: registeredToggleTool,
    settingsPath,
    sessionEntries,
    get command() {
      const currentCommand = commands.get("adaptive-thinking");
      assert.ok(currentCommand);
      return currentCommand;
    },
    get activeTools() {
      return activeTools;
    },
    notifications,
    executeAdaptiveThinkingCommand(args = "") {
      const currentCommand = commands.get("adaptive-thinking");
      assert.ok(currentCommand);
      return currentCommand.handler(args, {
        ui: {
          notify(message) {
            notifications.push(message);
          },
        },
      });
    },
    async startSession() {
      assert.ok(sessionStartHandler);
      await sessionStartHandler(
        { type: "session_start" },
        {
          hasUI,
          ui: {
            addAutocompleteProvider() {},
          },
          sessionManager: {
            getEntries: () => sessionEntries,
          },
        },
      );
    },
    async createAutocompleteDescriptionReader(commandValue = "adaptive-thinking") {
      assert.ok(sessionStartHandler);
      let autocompleteProviderFactory: TestAutocompleteProviderFactory | undefined;
      const cachedDescription = commands.get(commandValue)?.description;
      await sessionStartHandler(
        { type: "session_start" },
        {
          hasUI,
          ui: {
            addAutocompleteProvider(factory) {
              autocompleteProviderFactory = factory;
            },
          },
          sessionManager: {
            getEntries: () => sessionEntries,
          },
        },
      );
      assert.ok(autocompleteProviderFactory);
      const autocompleteProvider = autocompleteProviderFactory({
        async getSuggestions() {
          return {
            items: [
              {
                value: commandValue,
                label: commandValue,
                ...(cachedDescription === undefined ? {} : { description: cachedDescription }),
              },
            ],
            prefix: `/${commandValue}`,
          };
        },
        applyCompletion() {
          throw new Error("Autocomplete application is not used by this test.");
        },
      });

      return async () => {
        const result = await autocompleteProvider.getSuggestions([`/${commandValue}`], 0, 18);
        return result?.items[0]?.description;
      };
    },
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
    execute(level: SelectableThinkingLevel, reason?: string) {
      return registeredTool.execute(
        "tool-call-1",
        { level, ...(reason === undefined ? {} : { reason }) },
        new AbortController().signal,
        undefined,
        { model },
      );
    },
    executeToggle(
      enabled: boolean,
      level?: SelectableThinkingLevel,
      reason = "Test toggle reason",
    ) {
      return registeredToggleTool.execute(
        "toggle-tool-call-1",
        { enabled, ...(level === undefined ? {} : { level }), reason },
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
    assert.match(
      tool.parameters.shape.reason.description ?? "",
      /breadcrumb.*why.*effort level.*appropriate/i,
    );
    assert.match(tool.description, /during a coding-agent run/i);
    assert.match(tool.description, /initial checkpoint/i);
    assert.match(tool.description, /phase or evidence changes/i);
    assert.match(tool.description, /escalate.*failing tests.*ambiguity.*high-risk/i);
    assert.match(tool.description, /de-escalate.*known.*mechanical/i);
    assert.match(tool.description, /persists.*long-running work.*revisit/i);
  });
  test("registers the explicit adaptive-thinking toggle contract", () => {
    const { toggleTool } = createHarness({
      globallyEnabled: false,
      allowAgentToggle: true,
    });

    assert.equal(toggleTool.name, "toggle_adaptive_thinking");
    assert.equal(toggleTool.defaultInactive, false);
    assert.deepEqual(toggleTool.parameters.shape.level.values, SELECTABLE_THINKING_LEVELS);
    assert.match(
      toggleTool.parameters.shape.reason.description ?? "",
      /reason.*changing adaptive-thinking mode/i,
    );
    assert.match(toggleTool.description, /session tree.*global default/i);
    assert.match(toggleTool.description, /enabled true.*long-running task/i);
    assert.match(toggleTool.description, /enabled target.*retries idempotent/i);
  });

  test("guides a fixed-level agent when global adaptive thinking is off", async () => {
    const harness = createHarness({
      initialLevel: "high",
      globallyEnabled: false,
      allowAgentToggle: true,
    });
    await harness.startSession();

    assert.deepEqual(harness.activeTools, ["read", "toggle_adaptive_thinking"]);
    const promptBlocks = await harness.injectGuidance(["Base prompt"]);
    assert.equal(promptBlocks[0], "Base prompt");
    const guidance = promptBlocks.at(-1);
    assert.ok(guidance);
    assert.match(guidance, /Adaptive thinking is off/i);
    assert.match(guidance, /Current thinking level: high/i);
    assert.match(guidance, /long-task rule.*materially higher.*substantial work remaining/i);
    assert.match(guidance, /toggle_adaptive_thinking.*enabled true.*lowest adequate/i);
    assert.match(guidance, /never changes the global default/i);
  });

  test("enables adaptive thinking at the requested level for the session tree", async () => {
    const parent = createHarness({
      initialLevel: "high",
      globallyEnabled: false,
      allowAgentToggle: true,
    });
    await parent.startSession();

    const result = await parent.executeToggle(
      true,
      "low",
      "The remaining implementation is mechanical",
    );

    assert.equal(result.isError, undefined);
    assert.deepEqual(parent.setCalls, ["low"]);
    assert.deepEqual(parent.activeTools, [
      "read",
      "toggle_adaptive_thinking",
      "set_thinking_level",
    ]);
    assert.deepEqual(toggleDetails(result), {
      requestedEnabled: true,
      previousEnabled: false,
      effectiveEnabled: true,
      requestedLevel: "low",
      previousLevel: "high",
      effectiveLevel: "low",
      applied: true,
      reason: "The remaining implementation is mechanical",
    });
    assert.match(resultText(result), /enabled.*session tree.*Thinking level: low/i);

    const subagent = createHarness({
      settingsPath: parent.settingsPath,
      initialLevel: "high",
      globallyEnabled: false,
      allowAgentToggle: true,
      hasUI: false,
    });
    await subagent.startSession();
    assert.deepEqual(subagent.activeTools, [
      "read",
      "toggle_adaptive_thinking",
      "set_thinking_level",
    ]);
    assert.match((await subagent.injectGuidance([])).at(-1) ?? "", /Thinking effort policy/i);
  });

  test("disables adaptive thinking while keeping the effective level fixed", async () => {
    const harness = createHarness({
      initialLevel: "high",
      globallyEnabled: false,
      allowAgentToggle: true,
    });
    await harness.startSession();
    await harness.executeToggle(true, "low");

    const result = await harness.executeToggle(false, undefined, "Use a fixed level");

    assert.equal(result.isError, undefined);
    assert.deepEqual(harness.setCalls, ["low"]);
    assert.deepEqual(harness.activeTools, ["read", "toggle_adaptive_thinking"]);
    assert.deepEqual(toggleDetails(result), {
      requestedEnabled: false,
      previousEnabled: true,
      effectiveEnabled: false,
      requestedLevel: null,
      previousLevel: "low",
      effectiveLevel: "low",
      applied: true,
      reason: "Use a fixed level",
    });
    assert.match((await harness.injectGuidance([])).at(-1) ?? "", /Adaptive thinking is off/i);
  });

  test("rejects invalid adaptive-thinking toggle requests without changing state", async () => {
    const harness = createHarness({
      initialLevel: "high",
      globallyEnabled: false,
      allowAgentToggle: true,
    });
    await harness.startSession();

    const missingLevel = await harness.executeToggle(true);
    const disablingWithLevel = await harness.executeToggle(false, "low");
    const unsupportedLevel = await harness.executeToggle(true, "xhigh");

    assert.equal(missingLevel.isError, true);
    assert.match(resultText(missingLevel), /without a level/i);
    assert.equal(disablingWithLevel.isError, true);
    assert.match(resultText(disablingWithLevel), /disable.*with a level.*omit level/i);
    assert.equal(unsupportedLevel.isError, true);
    assert.match(
      resultText(unsupportedLevel),
      /not supported.*Supported levels: off, low, medium, high/i,
    );
    assert.deepEqual(harness.setCalls, []);
    assert.deepEqual(harness.activeTools, ["read", "toggle_adaptive_thinking"]);
  });

  test("hides toggle guidance and rejects direct calls when agent toggles are disabled", async () => {
    const harness = createHarness({
      initialLevel: "high",
      globallyEnabled: false,
      allowAgentToggle: false,
    });
    await harness.startSession();

    assert.equal(harness.toggleTool.defaultInactive, true);
    assert.deepEqual(harness.activeTools, ["read"]);
    assert.deepEqual(await harness.injectGuidance(["Base prompt"]), ["Base prompt"]);

    const result = await harness.executeToggle(true, "low");
    assert.equal(result.isError, true);
    assert.match(resultText(result), /disabled in global settings/i);
    assert.deepEqual(harness.setCalls, []);
  });

  test("uses concise state in the command description", () => {
    const harness = createHarness();

    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: on, global: on, agent toggle: off)",
    );
  });

  test("offers adaptive, global, and agent-toggle command completions", () => {
    const harness = createHarness();
    const complete = harness.command.getArgumentCompletions;

    assert.ok(complete);
    const firstArgumentCompletions = complete("");
    assert.ok(firstArgumentCompletions);
    assert.deepEqual(
      firstArgumentCompletions.map((item) => item.value),
      ["on", "off", "session", "global", "agent-toggle"],
    );
    assert.deepEqual(
      complete("global o")?.map((item) => item.value),
      ["global on", "global off"],
    );
    assert.deepEqual(
      complete("agent-toggle o")?.map((item) => item.value),
      ["agent-toggle on", "agent-toggle off"],
    );
  });

  test("persists explicit agent-toggle arguments on the adaptive command", async () => {
    const harness = createHarness({ globallyEnabled: false, allowAgentToggle: true });
    await harness.startSession();
    const readAutocompleteDescription = await harness.createAutocompleteDescriptionReader();

    await harness.executeAdaptiveThinkingCommand("agent-toggle off");

    assert.deepEqual(harness.activeTools, ["read"]);
    assert.deepEqual(harness.notifications, ["Agent adaptive-thinking toggle disabled globally"]);
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: off, global: off, agent toggle: off)",
    );
    assert.equal(
      await readAutocompleteDescription(),
      "Adaptive thinking (session: off, global: off, agent toggle: off)",
    );
    assert.deepEqual(await harness.injectGuidance(["Base prompt"]), ["Base prompt"]);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: false,
      allowAgentToggle: false,
    });

    await harness.executeAdaptiveThinkingCommand("agent-toggle on");

    assert.deepEqual(harness.activeTools, ["read", "toggle_adaptive_thinking"]);
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: off, global: off, agent toggle: on)",
    );
    assert.match((await harness.injectGuidance([])).at(-1) ?? "", /Adaptive thinking is off/i);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: false,
      allowAgentToggle: true,
    });
  });

  test("propagates agent-toggle arguments to current subagents", async () => {
    const parent = createHarness({ globallyEnabled: false, allowAgentToggle: true });
    await parent.startSession();
    const subagent = createHarness({
      settingsPath: parent.settingsPath,
      globallyEnabled: false,
      allowAgentToggle: true,
      hasUI: false,
    });
    await subagent.startSession();

    await parent.executeAdaptiveThinkingCommand("agent-toggle off");

    assert.deepEqual(parent.activeTools, ["read"]);
    assert.deepEqual(subagent.activeTools, ["read"]);
    assert.deepEqual(await subagent.injectGuidance(["Base prompt"]), ["Base prompt"]);

    await parent.executeAdaptiveThinkingCommand("agent-toggle");

    assert.deepEqual(parent.activeTools, ["read", "toggle_adaptive_thinking"]);
    assert.deepEqual(subagent.activeTools, ["read", "toggle_adaptive_thinking"]);
    assert.match((await subagent.injectGuidance([])).at(-1) ?? "", /Adaptive thinking is off/i);
  });

  test("updates the live autocomplete description after a session toggle", async () => {
    const harness = createHarness();
    const readAutocompleteDescription = await harness.createAutocompleteDescriptionReader();

    assert.equal(
      await readAutocompleteDescription(),
      "Adaptive thinking (session: on, global: on, agent toggle: off)",
    );

    await harness.executeAdaptiveThinkingCommand("off");

    assert.equal(
      await readAutocompleteDescription(),
      "Adaptive thinking (session: off, global: on, agent toggle: off)",
    );
  });

  test("defaults on and off arguments to the current session", async () => {
    const harness = createHarness({ initialLevel: "medium" });

    await harness.executeAdaptiveThinkingCommand("off");

    assert.deepEqual(harness.activeTools, ["read"]);
    assert.deepEqual(harness.notifications, ["Adaptive thinking disabled for this session"]);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: true,
      allowAgentToggle: false,
    });
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: off, global: on, agent toggle: off)",
    );
    assert.deepEqual(await harness.injectGuidance(["Base prompt"]), ["Base prompt"]);

    const disabledResult = await harness.execute("high");
    assert.equal(disabledResult.isError, true);
    assert.match(resultText(disabledResult), /adaptive thinking is disabled/i);
    assert.deepEqual(harness.setCalls, []);

    await harness.executeAdaptiveThinkingCommand("on");

    assert.deepEqual(harness.activeTools, ["read", "set_thinking_level"]);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: true,
      allowAgentToggle: false,
    });
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: on, global: on, agent toggle: off)",
    );
  });
  test("propagates session toggles to current and future subagents", async () => {
    const parent = createHarness({ globallyEnabled: true, hasUI: true });
    await parent.startSession();
    const currentSubagent = createHarness({
      settingsPath: parent.settingsPath,
      globallyEnabled: true,
      hasUI: false,
    });
    await currentSubagent.startSession();

    await parent.executeAdaptiveThinkingCommand("session off");

    assert.deepEqual(parent.activeTools, ["read"]);
    assert.deepEqual(currentSubagent.activeTools, ["read"]);

    const futureSubagent = createHarness({
      settingsPath: parent.settingsPath,
      globallyEnabled: true,
      hasUI: false,
    });
    await futureSubagent.startSession();
    assert.deepEqual(futureSubagent.activeTools, ["read"]);

    await parent.executeAdaptiveThinkingCommand("session on");

    assert.deepEqual(parent.activeTools, ["read", "set_thinking_level"]);
    assert.deepEqual(currentSubagent.activeTools, ["read", "set_thinking_level"]);
    assert.deepEqual(futureSubagent.activeTools, ["read", "set_thinking_level"]);
  });
  test("keeps an interactive parent authoritative when another runtime exists", async () => {
    const existingRuntime = createHarness({ globallyEnabled: false, hasUI: false });
    await existingRuntime.startSession();
    const activeParent = createHarness({
      settingsPath: existingRuntime.settingsPath,
      globallyEnabled: false,
      hasUI: true,
      sessionEntries: [
        {
          type: "custom",
          customType: "adaptive-thinking-session",
          data: { enabled: true },
        },
      ],
    });
    await activeParent.startSession();
    const subagent = createHarness({
      settingsPath: existingRuntime.settingsPath,
      globallyEnabled: false,
      hasUI: false,
    });
    await subagent.startSession();

    assert.deepEqual(activeParent.activeTools, ["read", "set_thinking_level"]);
    assert.deepEqual(subagent.activeTools, ["read", "set_thinking_level"]);
  });

  test("persists global on and off arguments", async () => {
    const harness = createHarness();

    await harness.executeAdaptiveThinkingCommand("global off");

    assert.deepEqual(harness.activeTools, ["read"]);
    assert.deepEqual(harness.notifications, ["Adaptive thinking disabled globally"]);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: false,
      allowAgentToggle: false,
    });
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: off, global: off, agent toggle: off)",
    );

    await harness.executeAdaptiveThinkingCommand("global on");

    assert.deepEqual(harness.activeTools, ["read", "set_thinking_level"]);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: true,
      allowAgentToggle: false,
    });
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: on, global: on, agent toggle: off)",
    );
  });

  test("toggles the session when no arguments are given", async () => {
    const harness = createHarness({ globallyEnabled: false });

    assert.equal(harness.tool.defaultInactive, true);
    await harness.executeAdaptiveThinkingCommand();

    assert.deepEqual(harness.activeTools, ["read", "set_thinking_level"]);
    assert.deepEqual(JSON.parse(readFileSync(harness.settingsPath, "utf8")), {
      enabled: false,
      allowAgentToggle: false,
    });
    assert.equal(
      harness.command.description,
      "Adaptive thinking (session: on, global: off, agent toggle: off)",
    );
  });

  test("restores the session override after extension restart", async () => {
    const initialHarness = createHarness({ globallyEnabled: true });

    await initialHarness.executeAdaptiveThinkingCommand("off");

    const restartedHarness = createHarness({
      globallyEnabled: true,
      sessionEntries: initialHarness.sessionEntries,
    });
    await restartedHarness.startSession();

    assert.deepEqual(restartedHarness.activeTools, ["read"]);
    assert.equal(
      restartedHarness.command.description,
      "Adaptive thinking (session: off, global: on, agent toggle: off)",
    );
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
    assert.match(
      guidance,
      /next model call.*interpret.*expected tool result.*not.*tool-command mechanics/i,
    );
    assert.match(guidance, /initial checkpoint/i);
    assert.match(
      guidance,
      /lease renewal.*cancellation.*abort races.*guarded finalization.*process termination.*concurrency.*before implementation/i,
    );
    assert.match(guidance, /target differs from Current.*call set_thinking_level/i);
    assert.match(guidance, /Current.*provider default.*unknown.*call set_thinking_level/i);
    assert.match(guidance, /Do not call.*target equals Current/i);
    assert.match(guidance, /Long-running tasks.*reassess throughout the run/i);
    assert.match(guidance, /phase transition.*exploration.*implementation.*verification/i);
    assert.match(guidance, /unexpected evidence.*test failure.*tool error.*conflicting/i);
    assert.match(guidance, /before.*high-risk.*after.*uncertainty.*resolved/i);
    assert.match(guidance, /Escalate.*repeated failed hypotheses.*unfamiliar/i);
    assert.match(
      guidance,
      /De-escalate.*known-path.*low-effort verification.*known.*available.*contract.*type.*security/i,
    );
    assert.match(
      guidance,
      /Do not de-escalate solely.*verifier.*plausible failure.*reopen diagnosis/i,
    );
    assert.match(
      guidance,
      /verification fails after a de-escalation.*confidence.*invalidated.*reassess.*before.*diagnostic action/i,
    );
    assert.match(guidance, /target MUST be one of the exact values listed in Available/i);
    assert.match(
      guidance,
      /low:.*predictable result interpretation.*known-path mechanical.*diagnostic uncertainty/i,
    );
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

  test("records an optional reason for a successful effort change", async () => {
    const harness = createHarness({ initialLevel: "low" });
    const reason = "Unexpected test failures require diagnosis.";

    const result = await harness.execute("high", reason);

    assert.deepEqual(details(result), {
      requestedLevel: "high",
      previousLevel: "low",
      effectiveLevel: "high",
      applied: true,
      effectiveChanged: true,
      reason,
    });
    assert.match(resultText(result), /Reason: Unexpected test failures require diagnosis\./);
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
