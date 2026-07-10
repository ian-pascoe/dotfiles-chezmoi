# OMP Adaptive Thinking Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-callable OMP tool that pins an exact supported thinking
level for the current session and affects the continuation request after the
tool result.

**Architecture:** Add one host-loaded extension at the chezmoi source path for
`~/.omp/agent/extensions`. The extension validates exact levels against the
active model, delegates session and provider behavior to OMP's native
`setThinkingLevel` seam, and returns deterministic text plus structured details.
A root Vitest file exercises the registered tool through its public interface
without creating a new OMP package or runtime dependency.

**Tech Stack:** TypeScript, OMP 16.3.15 extension API, host-provided Zod, Vitest
4, Node strict assertions, chezmoi.

## Global Constraints

- Implement the approved contract in
  `docs/superpowers/specs/2026-07-10-omp-adaptive-thinking-design.md`.
- Use the tool name `set_thinking_level` and classify it with
  `approval: "write"`.
- Accept only `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`.
- A successful selection is session-scoped; do not implement temporary
  restoration or `auto` selection.
- Every valid request calls `pi.setThinkingLevel()`, including when the
  requested level equals the current effective level.
- Validate non-`off` requests against `ctx.model.thinking?.efforts` before
  mutation; do not rely only on OMP clamping.
- Permit `off` without model effort metadata.
- Normalize host-reported `inherit` and undefined levels to `null` in details
  and `provider default` in text.
- Do not use `before_provider_request`, lifecycle state, prompt injection,
  extension config, or provider-specific mappings.
- Do not add a package, workspace entry, build configuration, or runtime
  dependency.
- Do not apply the full chezmoi source tree; the live OMP config contains
  unrelated machine-local state.
- Keep `tests/` repo-only through an exact `.chezmoiignore` entry; never deploy
  the harness to `~/tests`.
- Preserve all pre-existing unrelated working-tree changes and stage only files
  named by this plan.

---

### Task 1: Exact session thinking-level tool

**Files:**

- Create: `dot_omp/agent/extensions/adaptive-thinking.ts`
- Create: `tests/omp/adaptive-thinking.test.ts`
- Modify: `.chezmoiignore:1-5`
- Modify: `vitest.config.ts:3-7`

**Interfaces:**

- Consumes: `ExtensionAPI.getThinkingLevel(): ThinkingLevel | undefined`,
  `ExtensionAPI.setThinkingLevel(level: ThinkingLevel): void`,
  `ExtensionAPI.registerTool(...)`, `ExtensionAPI.zod`, and
  `ExtensionContext.model?.thinking?.efforts` from OMP 16.3.15.
- Produces: the model-facing tool `set_thinking_level({ level })` and result
  details `{ requestedLevel, previousLevel, effectiveLevel, applied,
  effectiveChanged }`.
- Deployment mapping: `dot_omp/agent/extensions/adaptive-thinking.ts` becomes
  `~/.omp/agent/extensions/adaptive-thinking.ts`.

- [ ] **Step 1: Keep tests repo-only and write the failing behavior tests**

Add `tests` beside `docs` in the repo-only section of `.chezmoiignore` so the
new root test tree is never deployed to `~/tests`:

```gitignore
**/README.md
AGENTS.md
docs
tests

node_modules
```

Add the repo-only `tests` project to the existing root Vitest workspace:

```ts
export default defineConfig({
  test: {
    projects: ["./dot_config/opencode", "./dot_pi/agent", "./tests"],
  },
});
```

Then create `tests/omp/adaptive-thinking.test.ts` with the complete mock-host
harness and observable contract tests below:

```ts
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import adaptiveThinking from "../../dot_omp/agent/extensions/adaptive-thinking";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
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
  return result.content
    .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
    .join("\n");
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
      currentLevel = options.applyLevel
        ? options.applyLevel(level, currentLevel)
        : level;
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
    assert.match(
      tool.description,
      /subsequent model calls in this OMP session/i,
    );
    assert.match(
      tool.description,
      /remains active until the model or user changes it/i,
    );
    assert.match(
      tool.description,
      /replaces automatic selection for this session/i,
    );
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
```

- [ ] **Step 2: Run the focused tests and verify the red state**

Run:

```bash
pnpm exec vitest run tests/omp/adaptive-thinking.test.ts
```

Expected: FAIL because `dot_omp/agent/extensions/adaptive-thinking.ts` does not
exist.

- [ ] **Step 3: Implement the minimal host-loaded extension**

Create `dot_omp/agent/extensions/adaptive-thinking.ts` with this implementation:

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
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
  return (
    typeof value === "string" &&
    (THINKING_LEVELS as readonly string[]).includes(value)
  );
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
      const supportedLevels: ThinkingLevel[] = [
        "off",
        ...modelEfforts.filter(isThinkingLevel),
      ];

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
        `Thinking level explicitly set to ${effectiveLevelText} ` +
          "for this session.",
        details,
      );
    },
  });
}
```

- [ ] **Step 4: Run the focused tests and verify the green state**

Run:

```bash
pnpm exec vitest run tests/omp/adaptive-thinking.test.ts
```

Expected: PASS with 9 passing tests and no failures.

- [ ] **Step 5: Verify the chezmoi deployment mapping without applying it**

Run:

```bash
chezmoi target-path dot_omp/agent/extensions/adaptive-thinking.ts
```

Expected:

```text
/home/ianpascoe/.omp/agent/extensions/adaptive-thinking.ts
```

Do not run a full `chezmoi apply`; the live `~/.omp/agent/config.yml` contains
unrelated machine-local fields absent from the source tree.

- [ ] **Step 6: Run the extension through the installed OMP loader**

Run a fresh isolated smoke session using the source file directly. Do not
combine the explicit extension with `--no-extensions`: OMP 16.3.15 suppresses
it despite the CLI help claiming explicit paths still load.

```bash
SYSTEM_PROMPT="Use only the tool explicitly requested by the user."
USER_PROMPT='Call set_thinking_level with {"level":"high"}, then reply '\
'ADAPTIVE_THINKING_SMOKE_OK.'
omp \
  --extension=dot_omp/agent/extensions/adaptive-thinking.ts \
  --no-skills \
  --no-rules \
  --mode json \
  --print \
  --session-dir /tmp/omp-adaptive-thinking-smoke-absolute \
  --thinking low \
  --model openai-codex/gpt-5.6-sol:low \
  --auto-approve \
  --system-prompt "$SYSTEM_PROMPT" \
  "$USER_PROMPT"
```

Expected observable sequence:

1. OMP loads the extension without a module or schema error.
2. The model calls `set_thinking_level` with `{ "level": "high" }`.
3. The tool result contains `Thinking level explicitly set to high for this
   session.` and details with `requestedLevel: "high"`, `effectiveLevel:
   "high"`, and `applied: true`.
4. The assistant continuation occurs after that tool result and prints
   `ADAPTIVE_THINKING_SMOKE_OK`.

Use the harness `grep` tool, not a shell grep, to search
`/tmp/omp-adaptive-thinking-smoke-absolute` for `thinking_level_change`.
Expected: a
session entry records `high` before the final assistant continuation. Remove
only this named temporary smoke directory after inspection.

If provider credentials or network availability prevent the model call, record
the exact failure and still require the loader to start without an extension
error; do not claim the continuation behavior was smoke-tested.

- [ ] **Step 7: Format and lint the new TypeScript files**

Run:

```bash
pnpm exec oxfmt --write \
  vitest.config.ts \
  dot_omp/agent/extensions/adaptive-thinking.ts \
  tests/omp/adaptive-thinking.test.ts
pnpm exec oxlint \
  vitest.config.ts \
  dot_omp/agent/extensions/adaptive-thinking.ts \
  tests/omp/adaptive-thinking.test.ts
pnpm exec vitest run tests/omp/adaptive-thinking.test.ts
```

Expected: `oxfmt` completes, `oxlint` reports no errors, and all 9 tests pass
after formatting.

- [ ] **Step 8: Review and commit only the implementation files**

Review the two new files, the exact `.chezmoiignore` addition, and the existing
Vitest project-list update against the approved spec. Confirm there is no
temporary-reset state, raw provider middleware, prompt hook, config file, or
dependency change.

Run:

```bash
git add \
  .chezmoiignore \
  vitest.config.ts \
  dot_omp/agent/extensions/adaptive-thinking.ts \
  tests/omp/adaptive-thinking.test.ts
git commit -m "feat: add adaptive OMP thinking control"
```

Expected: one feature commit containing only the repo-only test ignore, Vitest
project registration, extension, and focused tests. Pre-existing unrelated
working-tree changes remain unstaged.
