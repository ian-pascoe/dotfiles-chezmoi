import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

import type { Model } from "@oh-my-pi/pi-ai";

vi.mock("@oh-my-pi/pi-ai", () => ({ completeSimple: vi.fn() }));

import { isTrustedLocalTUI, registerGuardian } from "./guardian";
import type { GuardianAuditRecord } from "./guardian/audit";
import { parseGuardianConfig, type GuardianConfig, type ReviewerIdentity } from "./guardian/policy";
import type { GuardianReviewResult, GuardianVerdict } from "./guardian/reviewer";
import { GuardianSessionRuntime } from "./guardian/session-runtime";

const reviewerModel = {
  id: "gpt-5.6-luna",
  name: "GPT-5.6 Luna",
  api: "openai-responses",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api/codex",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 272_000,
  maxTokens: 32_768,
} as Model;

const reviewer: ReviewerIdentity = {
  provider: reviewerModel.provider,
  model: reviewerModel.id,
  endpoint: reviewerModel.baseUrl,
  effort: "low",
};

function config(overrides: Record<string, unknown> = {}): GuardianConfig {
  const parsed = parseGuardianConfig({
    schemaVersion: "guardian-config/v1",
    providerDataAcknowledged: true,
    allowedReviewers: [{ provider: reviewer.provider, model: reviewer.model }],
    maxReviewDurationMs: 3_000,
    maxExactActionBytes: 65_536,
    protectedTools: [],
    rules: [],
    ...overrides,
  });
  if (!parsed.ok) assert.fail(parsed.errors.join("; "));
  return parsed.config;
}

function verdict(overrides: Partial<GuardianVerdict> = {}): GuardianVerdict {
  return {
    schemaVersion: "guardian-verdict/v1",
    risk: "medium",
    authorized: true,
    outcome: "allow",
    reason: "The exact action matches the bounded operator intent.",
    ...overrides,
  };
}
type HarnessOptions = {
  guardianConfig?: GuardianConfig | null;
  hasUI?: boolean;
  surface?: "tui" | "rpc" | "acp" | "collaboration" | "headless";
  confirm?: (title: string, message: string, options: Record<string, unknown>) => Promise<boolean>;
  deferPrompt?: boolean;
  remoteSelectApprove?: boolean;
  customResult?: unknown;
  promptTimeoutMs?: number;
  primaryModel?: Model | null;
  fallbackModel?: Model | null;
  review?: (input: unknown) => Promise<GuardianReviewResult>;
  credentialFailure?: boolean;
  failAudit?: boolean;
  sessionId?: string;
  provideExecutionSignal?: boolean;
};

type TestHandler = (event: unknown, ctx: unknown) => unknown | Promise<unknown>;

function createHarness(options: HarnessOptions = {}) {
  const handlers = new Map<string, TestHandler[]>();
  const sessionRecords: GuardianAuditRecord[] = [];
  const operationalRecords: GuardianAuditRecord[] = [];
  const resolutionOrder: string[] = [];
  const reviewCalls: unknown[] = [];
  const executionControllers = new Map<string, AbortController>();
  const promptComponents: Array<{ handleInput?(data: string): void }> = [];
  let selectCalls = 0;
  const confirmMessages: string[] = [];
  let currentSessionId = options.sessionId ?? "session-1";
  const confirm = vi.fn(
    options.confirm ??
      (async (_title: string, _message: string, _dialogOptions: Record<string, unknown>) => {
        return false;
      }),
  );
  const review = vi.fn(async (input: unknown): Promise<GuardianReviewResult> => {
    reviewCalls.push(input);
    if (options.review) return options.review(input);
    return { ok: true, verdict: verdict(), reviewer };
  });
  const api = {
    on(event: string, handler: TestHandler) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
    },
    appendEntry() {},
    logger: { warn() {}, error() {}, debug() {}, info() {} },
  };
  const registrationOptions = {
    config: options.guardianConfig === undefined ? config() : options.guardianConfig,
    guardianRoot: process.cwd(),
    review: review as never,
    ...(options.provideExecutionSignal === false
      ? {}
      : {
          executionSignal: (toolCallId: string) => {
            let controller = executionControllers.get(toolCallId);
            if (!controller) {
              controller = new AbortController();
              executionControllers.set(toolCallId, controller);
            }
            return controller.signal;
          },
        }),
    promptTimeoutMs: options.promptTimeoutMs,
    auditTargets: {
      appendSession(record: GuardianAuditRecord) {
        if (options.failAudit) throw new Error("audit unavailable");
        sessionRecords.push(record);
      },
      appendOperational(record: GuardianAuditRecord) {
        if (options.failAudit) throw new Error("audit unavailable");
        operationalRecords.push(record);
      },
    },
  };
  registerGuardian(api as never, registrationOptions as never);
  const surface = options.surface ?? (options.hasUI ? "tui" : "headless");
  const ctx = {
    cwd: process.cwd(),
    hasUI: surface !== "headless",
    ui: {
      ...(surface === "tui" || surface === "collaboration"
        ? { timeoutStartsOnPresentation: true }
        : {}),
      async select(title: string, _items: string[], dialogOptions: Record<string, unknown>) {
        selectCalls += 1;
        confirmMessages.push(title);
        if (options.remoteSelectApprove !== undefined)
          return options.remoteSelectApprove ? "Allow once" : "Deny";
        return (await confirm(title, "", dialogOptions)) ? "Allow once" : "Deny";
      },
      async custom(
        factory: (
          tui: unknown,
          theme: { fg: (_color: string, text: string) => string; bold: (text: string) => string },
          keybindings: unknown,
          done: (result: string | undefined) => void,
        ) => {
          render(width: number): readonly string[];
          handleInput?(data: string): void;
          dispose?(): void;
        },
      ) {
        if (Object.hasOwn(options, "customResult")) return options.customResult;
        const completion = Promise.withResolvers<string | undefined>();
        let component:
          | {
              render(width: number): readonly string[];
              handleInput?(data: string): void;
              dispose?(): void;
            }
          | undefined;
        const done = (result: string | undefined) => {
          component?.dispose?.();
          completion.resolve(result);
        };
        component = await factory(
          {},
          { fg: (_color, text) => text, bold: (text) => text },
          {},
          done,
        );
        const title = component.render(120).join("\n");
        confirmMessages.push(title);
        promptComponents.push(component);
        if (!options.deferPrompt) {
          try {
            component.handleInput?.((await confirm(title, "", {})) ? "a" : "\r");
          } catch (error) {
            component.dispose?.();
            throw error;
          }
        }
        return completion.promise;
      },
    },
    sessionManager: { getSessionId: () => currentSessionId },
    models: {
      resolve(spec: string) {
        resolutionOrder.push(spec);
        if (spec === "@guardian")
          return options.primaryModel === undefined
            ? reviewerModel
            : (options.primaryModel ?? undefined);
        return options.fallbackModel === undefined
          ? reviewerModel
          : (options.fallbackModel ?? undefined);
      },
    },
    modelRegistry: {
      resolver: () => {
        if (options.credentialFailure) throw new Error("credential resolver unavailable");
        return async () => "test-key";
      },
    },
  };

  const emit = async (name: string, event: Record<string, unknown>, eventContext = ctx) => {
    let result: unknown;
    for (const handler of handlers.get(name) ?? []) result = await handler(event, eventContext);
    return result as { block?: boolean; reason?: string } | undefined;
  };
  const start = async () => emit("session_start", { type: "session_start" });
  const toolCall = async (
    toolName: string,
    input: Record<string, unknown>,
    id = `call-${Math.random()}`,
  ) => emit("tool_call", { type: "tool_call", toolCallId: id, toolName, input });

  return {
    confirm,
    confirmMessages,
    ctx,
    emit,
    handlers,
    operationalRecords,
    resolutionOrder,
    review,
    reviewCalls,
    inputPrompt(data: string) {
      promptComponents.at(-1)?.handleInput?.(data);
    },
    abortCall(id: string, reason = new Error("parent cancelled")) {
      let controller = executionControllers.get(id);
      if (!controller) {
        controller = new AbortController();
        executionControllers.set(id, controller);
      }
      controller.abort(reason);
    },
    sessionRecords,
    selectCalls: () => selectCalls,
    setSessionId(value: string) {
      currentSessionId = value;
    },
    start,
    toolCall,
  };
}
describe("Guardian extension enforcement", () => {
  test("leaves ordinary reads outside Guardian and reviews bash commands", async () => {
    const harness = createHarness();
    await harness.start();

    const readResult = await harness.toolCall("read", { path: "package.json" }, "read-1");
    const statusResult = await harness.toolCall("bash", { command: "git status" }, "status-1");

    assert.equal(readResult, undefined);
    assert.equal(statusResult, undefined);
    assert.equal(harness.review.mock.calls.length, 1);
    assert.equal(harness.sessionRecords.length, 1);
    assert.equal(harness.sessionRecords[0]?.disposition, "model_allow");
    assert.deepEqual(harness.operationalRecords, harness.sessionRecords);
  });

  test("blocks critical model verdict without confirmation", async () => {
    const harness = createHarness({
      hasUI: true,
      review: async () => ({
        ok: true,
        verdict: verdict({ risk: "critical", outcome: "deny", authorized: false }),
        reviewer,
      }),
    });
    await harness.start();

    const result = await harness.toolCall("bash", { command: "git push" }, "critical-1");

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /critical_risk/);
    assert.equal(harness.confirm.mock.calls.length, 0);
    assert.equal(harness.sessionRecords[0]?.disposition, "model_block");
  });

  test("never accepts a fake confirmation surface outside trusted local UI", async () => {
    const harness = createHarness({
      surface: "rpc",
      confirm: async () => true,
      review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
    });
    await harness.start();

    const result = await harness.toolCall("bash", { command: "git push" }, "headless-high-1");

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /high_risk/);
    assert.equal(harness.confirm.mock.calls.length, 0);
    assert.equal(harness.sessionRecords[0]?.disposition, "model_block");
  });

  test("prompts for high risk, safely encodes fields, and approves only once", async () => {
    const rationale = "approve\u001b[2J\u202e／rm";
    const harness = createHarness({
      hasUI: true,
      confirm: async () => true,
      review: async () => ({
        ok: true,
        verdict: verdict({ risk: "high", reason: rationale }),
        reviewer,
      }),
    });
    await harness.start();

    const result = await harness.toolCall(
      "bash",
      { command: "deploy\u001b[2J\u202e／prod" },
      "high-1",
    );

    assert.equal(result, undefined);
    assert.equal(harness.confirm.mock.calls.length, 1);
    assert.match(harness.confirmMessages[0] ?? "", /\\u001b/);
    assert.match(harness.confirmMessages[0] ?? "", /\\u202e/);
    assert.match(harness.confirmMessages[0] ?? "", /\\uff0f/);
    for (const unsafe of ["\u001b", "\u202e", "／"])
      assert.equal((harness.confirmMessages[0] ?? "").includes(unsafe), false);
    assert.equal(harness.sessionRecords[0]?.disposition, "prompt_approve");
  });

  test("distinguishes operator denial and dismissal without caching approval", async () => {
    const cases: Array<{
      expected: GuardianAuditRecord["disposition"];
      confirm: NonNullable<HarnessOptions["confirm"]>;
    }> = [
      { expected: "prompt_deny", confirm: async () => false },
      {
        expected: "prompt_dismiss",
        confirm: async () => {
          throw new Error("dialog dismissed");
        },
      },
    ];

    for (const [index, scenario] of cases.entries()) {
      const harness = createHarness({
        hasUI: true,
        confirm: scenario.confirm,
        review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
      });
      await harness.start();

      const result = await harness.toolCall(
        "bash",
        { command: "git push" },
        `prompt-terminal-${index}`,
      );

      assert.equal(result?.block, true);
      assert.equal(harness.sessionRecords[0]?.disposition, scenario.expected);
    }
  });

  test("re-prompts for cached high-risk assessments and never caches consent", async () => {
    const harness = createHarness({
      hasUI: true,
      confirm: async () => true,
      review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
    });
    await harness.start();
    await harness.emit("before_agent_start", { type: "before_agent_start", prompt: "Deploy." });

    await harness.toolCall("bash", { command: "git push" }, "high-cache-1");
    await harness.toolCall("bash", { command: "git push" }, "high-cache-2");

    assert.equal(harness.review.mock.calls.length, 1);
    assert.equal(harness.confirm.mock.calls.length, 2);
    assert.deepEqual(
      harness.sessionRecords.map((record) => record.disposition),
      ["prompt_approve", "prompt_approve"],
    );
  });

  test("enforces confirmation and minimum-risk rules after model review", async () => {
    const confirmation = createHarness({
      guardianConfig: config({ rules: [{ effect: "confirm", tool: "bash" }] }),
      hasUI: true,
      confirm: async () => false,
    });
    const criticalFloor = createHarness({
      guardianConfig: config({
        rules: [{ effect: "minimum-risk", tool: "bash", risk: "critical" }],
      }),
      hasUI: true,
      confirm: async () => true,
    });
    await confirmation.start();
    await criticalFloor.start();

    const prompted = await confirmation.toolCall("bash", { command: "git push" }, "confirm-rule-1");
    const blockedByFloor = await criticalFloor.toolCall(
      "bash",
      { command: "git push" },
      "risk-floor-1",
    );

    assert.equal(prompted?.block, true);
    assert.equal(confirmation.confirm.mock.calls.length, 1);
    assert.equal(confirmation.sessionRecords[0]?.disposition, "prompt_deny");
    assert.equal(blockedByFloor?.block, true);
    assert.match(blockedByFloor?.reason ?? "", /critical_risk/);
    assert.equal(criticalFloor.confirm.mock.calls.length, 0);
  });

  test("fails closed without trusted local UI for provider and schema failures", async () => {
    for (const failure of ["provider-error", "invalid-response", "timeout"] as const) {
      const harness = createHarness({ review: async () => ({ ok: false, reason: failure }) });
      await harness.start();

      const result = await harness.toolCall("bash", { command: "git push" }, `failure-${failure}`);

      assert.equal(result?.block, true);
      assert.equal(harness.confirm.mock.calls.length, 0);
      assert.equal(harness.sessionRecords[0]?.disposition, "review_failure");
    }
  });

  test("uses fallback only when Guardian is unresolved and the identity is allowlisted", async () => {
    const harness = createHarness({ primaryModel: null, fallbackModel: reviewerModel });
    await harness.start();

    const result = await harness.toolCall("bash", { command: "git push" }, "fallback-1");

    assert.equal(result, undefined);
    assert.deepEqual(harness.resolutionOrder, ["@guardian", "@smol"]);
    assert.equal(harness.review.mock.calls.length, 1);
  });

  test("does not fall through from a resolved but unallowlisted Guardian", async () => {
    const other = { ...reviewerModel, id: "unapproved-model" } as Model;
    const harness = createHarness({ primaryModel: other, fallbackModel: reviewerModel });
    await harness.start();

    const result = await harness.toolCall("bash", { command: "git push" }, "mismatch-1");

    assert.equal(result?.block, true);
    assert.deepEqual(harness.resolutionOrder, ["@guardian"]);
    assert.equal(harness.review.mock.calls.length, 0);
    assert.equal(harness.sessionRecords[0]?.reason, "provider_unavailable");
  });

  test("releases attempts after a mismatched reviewer response", async () => {
    const mismatchedReviewer = { ...reviewer, model: "unexpected-reviewer" };
    const harness = createHarness({
      review: async () => ({ ok: true, verdict: verdict(), reviewer: mismatchedReviewer }),
    });
    await harness.start();

    const first = await harness.toolCall("bash", { command: "git push" }, "reviewer-mismatch");
    const second = await harness.toolCall("bash", { command: "git push" }, "reviewer-mismatch");

    assert.match(first?.reason ?? "", /session_invalidated/);
    assert.match(second?.reason ?? "", /session_invalidated/);
    assert.equal(harness.review.mock.calls.length, 2);
    assert.equal(harness.sessionRecords.length, 0);
  });

  test("caches low/medium assessment only within one session generation", async () => {
    const harness = createHarness();
    await harness.start();
    await harness.emit("before_agent_start", { type: "before_agent_start", prompt: "Publish." });

    await harness.toolCall("bash", { command: "git push" }, "cache-1");
    await harness.toolCall("bash", { command: "git push" }, "cache-2");
    harness.setSessionId("session-2");
    await harness.emit("session_switch", { type: "session_switch", reason: "new" });
    await harness.emit("before_agent_start", { type: "before_agent_start", prompt: "Publish." });
    await harness.toolCall("bash", { command: "git push" }, "cache-3");

    assert.equal(harness.review.mock.calls.length, 2);
    assert.deepEqual(
      harness.sessionRecords.map((record) => record.disposition),
      ["model_allow", "cached_allow", "model_allow"],
    );
    assert.notEqual(harness.sessionRecords[0]?.sessionTag, harness.sessionRecords[2]?.sessionTag);
  });

  test("blocks oversized actions and invalid executable xdev without model or UI", async () => {
    const harness = createHarness({
      guardianConfig: config({ maxExactActionBytes: 128 }),
      hasUI: true,
      confirm: async () => true,
    });
    await harness.start();

    const oversized = await harness.toolCall(
      "bash",
      { command: `git push ${"x".repeat(300)}` },
      "large-1",
    );
    const xdev = await harness.toolCall("write", { path: "xd://browser", content: "{}" }, "xdev-1");

    assert.equal(oversized?.block, true);
    assert.equal(xdev?.block, true);
    assert.equal(harness.review.mock.calls.length, 0);
    assert.equal(harness.confirm.mock.calls.length, 0);
    assert.deepEqual(
      harness.sessionRecords.map((record) => record.reason),
      ["action_too_large", "invalid_config"],
    );
  });

  test("blocks an otherwise authorized action when required audit persistence fails", async () => {
    const harness = createHarness({ failAudit: true });
    await harness.start();

    const result = await harness.toolCall("bash", { command: "git push" }, "audit-1");

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /audit_failure/);
  });

  test("invalidates an in-flight decision across branch lifecycle without caching or audit", async () => {
    const reviewCompletion = Promise.withResolvers<GuardianReviewResult>();
    const harness = createHarness({ review: async () => reviewCompletion.promise });
    await harness.start();

    const pending = harness.toolCall("bash", { command: "git push" }, "branch-1");
    await vi.waitFor(() => assert.equal(harness.review.mock.calls.length, 1));
    await harness.emit("session_before_branch", { type: "session_before_branch" });
    reviewCompletion.resolve({ ok: true, verdict: verdict(), reviewer });
    const result = await pending;

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /session_invalidated/);
    assert.equal(harness.sessionRecords.length, 0);
  });

  test("freezes reviewed input against downstream mutation", async () => {
    const reviewCompletion = Promise.withResolvers<GuardianReviewResult>();
    const harness = createHarness({ review: async () => reviewCompletion.promise });
    await harness.start();
    const input = { command: "git push" };

    const pending = harness.emit("tool_call", {
      type: "tool_call",
      toolCallId: "mutation-1",
      toolName: "bash",
      input,
    });
    await vi.waitFor(() => assert.equal(harness.review.mock.calls.length, 1));
    assert.throws(() => {
      input.command = "rm -rf /";
    }, TypeError);
    reviewCompletion.resolve({ ok: true, verdict: verdict(), reviewer });
    const result = await pending;

    assert.equal(result, undefined);
    assert.equal(harness.sessionRecords[0]?.disposition, "model_allow");
  });

  test("requires both host UI and the presentation-scoped TUI capability", () => {
    const context = (hasUI: boolean, timeoutStartsOnPresentation?: boolean) =>
      ({
        hasUI,
        ui: { timeoutStartsOnPresentation },
      }) as never;

    assert.equal(isTrustedLocalTUI(context(true, true)), true);
    assert.equal(isTrustedLocalTUI(context(false, true)), false);
    assert.equal(isTrustedLocalTUI(context(true)), false);
    assert.equal(isTrustedLocalTUI(context(true, false)), false);
  });

  test("authorizes through local custom TUI only and never through RPC, ACP, or collaboration select", async () => {
    const local = createHarness({
      surface: "tui",
      confirm: async () => true,
      review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
    });
    await local.start();
    assert.equal(await local.toolCall("bash", { command: "git push" }, "local-tui"), undefined);
    assert.equal(local.selectCalls(), 0);

    for (const surface of ["rpc", "acp", "collaboration"] as const) {
      const remote = createHarness({
        surface,
        remoteSelectApprove: true,
        confirm: async () => false,
        review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
      });
      await remote.start();
      const result = await remote.toolCall("bash", { command: "git push" }, `remote-${surface}`);
      assert.equal(result?.block, true);
      assert.equal(remote.selectCalls(), 0);
    }

    const forgedRemote = createHarness({
      surface: "collaboration",
      customResult: "approve",
      review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
    });
    await forgedRemote.start();
    const forgedResult = await forgedRemote.toolCall(
      "bash",
      { command: "git push" },
      "forged-remote",
    );
    assert.equal(forgedResult?.block, true);
    assert.match(forgedResult?.reason ?? "", /operator_dismissed/);
  });

  test("treats timeout as stronger than a late approval label", async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        surface: "tui",
        deferPrompt: true,
        promptTimeoutMs: 10,
        review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
      });
      await harness.start();

      const pending = harness.toolCall("bash", { command: "git push" }, "late-label");
      for (let tick = 0; tick < 10 && harness.confirmMessages.length === 0; tick += 1)
        await Promise.resolve();
      assert.equal(harness.confirmMessages.length, 1);
      await vi.advanceTimersByTimeAsync(8);
      harness.inputPrompt("x");
      await vi.advanceTimersByTimeAsync(3);
      harness.inputPrompt("a");
      const result = await pending;

      assert.equal(result?.block, true);
      assert.equal(harness.sessionRecords[0]?.disposition, "prompt_timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  test("normalizes thrown reviewer and credential failures into audited fallback decisions", async () => {
    const scenarios: HarnessOptions[] = [
      { review: async () => Promise.reject(new Error("reviewer exploded")) },
      { credentialFailure: true },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const harness = createHarness(scenario);
      await harness.start();
      const result = await harness.toolCall("bash", { command: "git push" }, `thrown-${index}`);

      assert.equal(result?.block, true);
      assert.equal(harness.sessionRecords[0]?.disposition, "review_failure");
      assert.equal(harness.sessionRecords[0]?.reason, "provider_failure");
    }

    const interactive = createHarness({
      surface: "tui",
      confirm: async () => false,
      review: async () => Promise.reject(new Error("reviewer exploded")),
    });
    await interactive.start();
    const result = await interactive.toolCall(
      "bash",
      { command: "git push" },
      "thrown-interactive",
    );
    assert.equal(result?.block, true);
    assert.equal(interactive.sessionRecords[0]?.disposition, "prompt_deny");
  });

  test("authorizes per call without a session ID and never reuses a cached assessment", async () => {
    const harness = createHarness({ sessionId: "" });
    await harness.start();
    await harness.emit("before_agent_start", { type: "before_agent_start", prompt: "Publish." });

    assert.equal(await harness.toolCall("bash", { command: "git push" }, "ephemeral-1"), undefined);
    assert.equal(await harness.toolCall("bash", { command: "git push" }, "ephemeral-2"), undefined);
    assert.equal(harness.review.mock.calls.length, 2);
    assert.deepEqual(
      harness.sessionRecords.map((record) => record.disposition),
      ["model_allow", "model_allow"],
    );
    const calls = harness.review.mock.calls.map(([input]) => input as { sessionId: string });
    assert.ok(calls.every(({ sessionId }) => sessionId.startsWith("guardian-ephemeral-")));
    assert.notEqual(calls[0]?.sessionId, calls[1]?.sessionId);
  });

  test("authorizes when the production host omits the parent execution signal", async () => {
    const harness = createHarness({ provideExecutionSignal: false });
    await harness.start();

    assert.equal(
      await harness.toolCall("bash", { command: "git push" }, "no-parent-signal"),
      undefined,
    );
    assert.equal(harness.review.mock.calls.length, 1);
    assert.equal(harness.sessionRecords[0]?.disposition, "model_allow");
  });

  test("ignores accumulating stream snapshots and consumes only authoritative assistant message end", async () => {
    const harness = createHarness();
    await harness.start();
    await harness.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Publish this.",
    });
    await harness.emit("message_update", {
      type: "message_update",
      message: {
        role: "assistant",
        get content() {
          throw new Error("stream snapshot should not be read");
        },
      },
    });
    await harness.emit("message_end", {
      type: "message_end",
      message: { role: "assistant", content: `${'"\\'.repeat(4_000)}assistant-tail` },
    });

    assert.equal(
      await harness.toolCall("bash", { command: "git push" }, "stream-bounded"),
      undefined,
    );
    const intent = (harness.reviewCalls[0] as { intent: string }).intent;
    assert.ok(intent.length <= 2_000);
    const parsedIntent = JSON.parse(intent) as { assistant: string };
    assert.equal(parsedIntent.assistant.endsWith("assistant-tail"), true);
  });

  test("keeps cancelled navigation ready while completion and shutdown invalidate generations", async () => {
    for (const [before, complete] of [
      ["session_before_switch", "session_switch"],
      ["session_before_branch", "session_branch"],
      ["session_before_tree", "session_tree"],
    ] as const) {
      const reviewCompletion = Promise.withResolvers<GuardianReviewResult>();
      const harness = createHarness({ review: async () => reviewCompletion.promise });
      await harness.start();
      const pending = harness.toolCall("bash", { command: "git push" }, `${before}-pending`);
      await vi.waitFor(() => assert.equal(harness.review.mock.calls.length, 1));
      await harness.emit(before, { type: before });
      reviewCompletion.resolve({ ok: true, verdict: verdict(), reviewer });
      assert.match((await pending)?.reason ?? "", /session_invalidated/);
      assert.equal(harness.sessionRecords.length, 0);

      harness.review.mockImplementation(async () => ({ ok: true, verdict: verdict(), reviewer }));
      assert.equal(
        await harness.toolCall("bash", { command: "git push" }, `${before}-cancelled`),
        undefined,
      );
      harness.setSessionId(`${before}-next`);
      await harness.emit(complete, { type: complete });
      assert.equal(
        await harness.toolCall("bash", { command: "git push" }, `${before}-complete`),
        undefined,
      );
      assert.equal(harness.review.mock.calls.length, 3);
      assert.deepEqual(
        harness.sessionRecords.map((record) => record.disposition),
        ["model_allow", "model_allow"],
      );
    }

    const shutdown = createHarness();
    await shutdown.start();
    await shutdown.emit("session_shutdown", { type: "session_shutdown" });
    assert.match(
      (await shutdown.toolCall("bash", { command: "git push" }, "after-shutdown"))?.reason ?? "",
      /invalid_config/,
    );
  });

  test("propagates parent cancellation and makes late review and prompt results inert", async () => {
    const reviewCompletion = Promise.withResolvers<GuardianReviewResult>();
    const reviewing = createHarness({ review: async () => reviewCompletion.promise });
    await reviewing.start();
    const reviewPending = reviewing.toolCall("bash", { command: "git push" }, "parent-review");
    await vi.waitFor(() => assert.equal(reviewing.review.mock.calls.length, 1));
    reviewing.abortCall("parent-review");
    reviewCompletion.resolve({ ok: true, verdict: verdict(), reviewer });
    assert.match((await reviewPending)?.reason ?? "", /session_invalidated/);
    assert.equal(reviewing.sessionRecords.length, 0);

    reviewing.review.mockImplementation(async () => ({ ok: true, verdict: verdict(), reviewer }));
    assert.equal(
      await reviewing.toolCall("bash", { command: "git push" }, "parent-review-after"),
      undefined,
    );
    assert.equal(reviewing.review.mock.calls.length, 2);
    assert.equal(reviewing.sessionRecords.length, 1);

    const prompting = createHarness({
      surface: "tui",
      deferPrompt: true,
      promptTimeoutMs: 100,
      review: async () => ({ ok: true, verdict: verdict({ risk: "high" }), reviewer }),
    });
    await prompting.start();
    const promptPending = prompting.toolCall("bash", { command: "git push" }, "parent-prompt");
    await vi.waitFor(() => assert.equal(prompting.confirmMessages.length, 1));
    prompting.abortCall("parent-prompt");
    prompting.inputPrompt("a");
    assert.match((await promptPending)?.reason ?? "", /session_invalidated/);
    assert.equal(prompting.sessionRecords.length, 0);
  });

  test("invalidates concurrent attempts and permits an ID only after its terminal decision", async () => {
    const completions: Array<PromiseWithResolvers<GuardianReviewResult>> = [];
    const harness = createHarness({
      review: async () => {
        const completion = Promise.withResolvers<GuardianReviewResult>();
        completions.push(completion);
        return completion.promise;
      },
    });
    await harness.start();
    const first = harness.toolCall("bash", { command: "git push" }, "concurrent-1");
    const second = harness.toolCall("bash", { command: "git fetch --all" }, "concurrent-2");
    await vi.waitFor(() => assert.equal(completions.length, 2));
    await harness.emit("session_before_tree", { type: "session_before_tree" });
    for (const completion of completions)
      completion.resolve({ ok: true, verdict: verdict(), reviewer });
    assert.match((await first)?.reason ?? "", /session_invalidated/);
    assert.match((await second)?.reason ?? "", /session_invalidated/);
    assert.equal(harness.sessionRecords.length, 0);

    harness.review.mockImplementation(async () => ({ ok: true, verdict: verdict(), reviewer }));
    assert.equal(await harness.toolCall("bash", { command: "git push" }, "reused"), undefined);
    assert.equal(await harness.toolCall("bash", { command: "git push" }, "reused"), undefined);
  });
});

describe("Guardian session runtime", () => {
  test("bounds ASCII, escaped, and Unicode intent envelopes while retaining both recent tails", () => {
    for (const fill of ["x", '"', "\\", "😀"]) {
      const runtime = new GuardianSessionRuntime();
      runtime.reset("session-1");
      const userTail = `user-tail-${fill}`;
      const assistantTail = `assistant-tail-${fill}`;

      runtime.startTurn(`${fill.repeat(4_000)}${userTail}`);
      runtime.updateAssistantIntent(`${fill.repeat(4_000)}${assistantTail}`);
      const evidence = runtime.intentEvidence();
      const parsed = JSON.parse(evidence) as { user: string; assistant: string };

      assert.ok(evidence.length <= 2_000, `serialized evidence was ${evidence.length} characters`);
      assert.ok(parsed.user.endsWith(userTail));
      assert.ok(parsed.assistant.endsWith(assistantTail));
    }
  });

  test("keeps an active session ready without a host session ID", () => {
    const runtime = new GuardianSessionRuntime();

    assert.equal(runtime.reset(""), true);
    assert.equal(runtime.ready, true);
    assert.equal(runtime.sessionId, "");
    assert.notEqual(
      runtime.beginAttempt("missing-session-id", {
        toolName: "bash",
        input: { command: "git push" },
        cwd: process.cwd(),
      }),
      null,
    );
    runtime.cache("missing-session-cache", { verdict: verdict(), reviewer });
    assert.equal(runtime.cached("missing-session-cache"), undefined);
  });

  test("aborts attempts before navigation without discarding active session readiness", () => {
    const runtime = new GuardianSessionRuntime();
    runtime.reset("session-1");
    const attempt = runtime.beginAttempt("before-navigation", {
      toolName: "bash",
      input: { command: "git push" },
      cwd: process.cwd(),
    });
    assert.notEqual(attempt, null);

    runtime.abortActive("navigation pending");

    assert.equal(attempt?.controller.signal.aborted, true);
    assert.equal(runtime.ready, true);
    assert.equal(runtime.sessionId, "session-1");
    assert.notEqual(
      runtime.beginAttempt("after-cancelled-navigation", {
        toolName: "bash",
        input: { command: "git push" },
        cwd: process.cwd(),
      }),
      null,
    );
  });
});

describe("Guardian OMP host canary", () => {
  test("discovers Guardian and enforces the installed wrapper chain before side effects", () => {
    const sandbox = mkdtempSync(join(import.meta.dirname, ".guardian-canary-"));
    try {
      const agentRoot = join(sandbox, "agent");
      const extensionsRoot = join(agentRoot, "extensions");
      const guardianRoot = join(extensionsRoot, "guardian");
      mkdirSync(guardianRoot, { recursive: true });
      for (const file of ["guardian.ts", "guardian.config.json"])
        cpSync(join(import.meta.dirname, file), join(extensionsRoot, file));
      for (const file of ["audit.ts", "policy.ts", "reviewer.ts", "session-runtime.ts"])
        cpSync(join(import.meta.dirname, "guardian", file), join(guardianRoot, file));
      const canaryConfig = JSON.parse(
        readFileSync(join(extensionsRoot, "guardian.config.json"), "utf8"),
      ) as Record<string, unknown>;
      canaryConfig.protectedTools = ["edit"];
      writeFileSync(
        join(extensionsRoot, "guardian.config.json"),
        `${JSON.stringify(canaryConfig)}\n`,
      );

      const scriptPath = join(sandbox, "canary.ts");
      writeFileSync(
        scriptPath,
        `
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  discoverExtensionPaths,
  loadExtensions,
} from "@oh-my-pi/pi-coding-agent/extensibility/extensions/loader";
import { ExtensionRunner } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/runner";
import { ExtensionUiController } from "@oh-my-pi/pi-coding-agent/modes/controllers/extension-ui-controller";
import { ExtensionToolWrapper } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/wrapper";

const [agentRoot, extensionsRoot, guardianEntry] = process.argv.slice(2);
assert.ok(agentRoot && extensionsRoot && guardianEntry);
const discovered = await discoverExtensionPaths([extensionsRoot], agentRoot);
const discoveredGuardian = discovered.find(path => resolve(path) === resolve(guardianEntry));
assert.equal(discoveredGuardian, guardianEntry);
const loaded = await loadExtensions([discoveredGuardian], agentRoot);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
// The canary intentionally imports the extension path selected by runtime discovery.
const { isTrustedLocalTUI: trustsLocalTUI } = await import(guardianEntry);

let observerCalls = 0;
let observedEvent;
let observedContext;
const observer = {
  path: "<guardian-canary-observer>",
  resolvedPath: "<guardian-canary-observer>",
  handlers: new Map([
    ["tool_call", [
      (event, ctx) => {
        observerCalls += 1;
        observedEvent = event;
        observedContext = ctx;
      },
    ]],
  ]),
  tools: new Map(),
  assistantThinkingRenderers: [],
  messageRenderers: new Map(),
  commands: new Map(),
  flags: new Map(),
  shortcuts: new Map(),
};
const sessionRecords = [];
const sessionManager = { getSessionId: () => "child-session" };
const modelRegistry = {
  getAvailable: () => [],
  resolver: () => {
    throw new Error("credentials must not be consulted by this canary");
  },
};
const protocolOptions = { canary: "local-protocol" };
const runner = new ExtensionRunner(
  [observer, ...loaded.extensions],
  loaded.runtime,
  agentRoot,
  sessionManager,
  modelRegistry,
  undefined,
  undefined,
  protocolOptions,
);
const actions = {
  sendMessage() {},
  sendUserMessage() {},
  appendEntry(_customType, data) {
    sessionRecords.push(data);
  },
  setLabel() {},
  getActiveTools: () => [],
  getAllTools: () => [],
  setActiveTools: async () => {},
  getCommands: () => [],
  setModel: async () => false,
  getThinkingLevel: () => undefined,
  setThinkingLevel() {},
  getSessionName: () => undefined,
  setSessionName: async () => {},
};
const contextActions = {
  getModel: () => undefined,
  isIdle: () => true,
  abort() {},
  hasPendingMessages: () => false,
  shutdown() {},
  getContextUsage: () => undefined,
  compact: async () => {},
  getSystemPrompt: () => [],
};
runner.initialize(actions, contextActions);
await runner.emit({ type: "session_start" });

let localUiContext;
let localHasUI = false;
const localController = new ExtensionUiController({
  setToolUIContext(ui, hasUI) {
    localUiContext = ui;
    localHasUI = hasUI;
  },
  session: { extensionRunner: undefined },
});
await localController.initHooksAndCustomTools();
assert.equal(trustsLocalTUI({ hasUI: localHasUI, ui: localUiContext }), true);
assert.equal(trustsLocalTUI({ hasUI: runner.hasUI(), ui: runner.getUIContext() }), false);
assert.equal(trustsLocalTUI({ hasUI: true, ui: {} }), false);
assert.equal(
  trustsLocalTUI({ hasUI: true, ui: { custom: async () => undefined } }),
  false,
);
assert.equal(
  trustsLocalTUI({ hasUI: false, ui: { timeoutStartsOnPresentation: true } }),
  false,
);

let sideEffects = 0;
let executedInput;
const secondTarget = join(agentRoot, "second.txt");
const resolveEditInput = (value) =>
  value
    .replaceAll("CANARY_TARGET", guardianEntry)
    .replaceAll("SECOND_TARGET", secondTarget);
const editTool = {
  name: "edit",
  label: "Edit",
  description: "Canary edit",
  parameters: {},
  resolveEventInput: resolveEditInput,
  async execute(_toolCallId, input) {
    executedInput = { ...input, input: resolveEditInput(input.input) };
    sideEffects += 1;
    return { content: [{ type: "text", text: "executed" }] };
  },
};
const wrapped = new ExtensionToolWrapper(editTool, runner);
const rawProtectedInput = {
  input: "¶CANARY_TARGET#ABCD\\nSWAP 1.=1:\\n+blocked",
};
const nativeDenyContext = {
  sessionManager,
  settings: {
    get(key) {
      if (key === "tools.approvalMode") return "yolo";
      if (key === "tools.approval") return { edit: "deny" };
      return undefined;
    },
  },
};
await assert.rejects(
  wrapped.execute("native-deny", rawProtectedInput, new AbortController().signal, undefined, nativeDenyContext),
  /blocked by user policy/,
);
assert.equal(observerCalls, 0);
assert.equal(sideEffects, 0);
assert.equal(sessionRecords.length, 0);

const yoloContext = {
  sessionManager,
  settings: {
    get(key) {
      if (key === "tools.approvalMode") return "yolo";
      if (key === "tools.approval") return {};
      return undefined;
    },
  },
};
await assert.rejects(
  wrapped.execute("guardian-block", rawProtectedInput, new AbortController().signal, undefined, yoloContext),
  /Guardian blocked/,
);
assert.equal(observerCalls, 1);
assert.equal(sideEffects, 0);
assert.equal(sessionRecords.length, 1);
assert.equal(observedEvent.input.input, resolveEditInput(rawProtectedInput.input));
assert.equal(observedEvent.input.path, guardianEntry);
assert.deepEqual(observedEvent.input.paths, [guardianEntry]);
assert.equal(Object.isFrozen(observedEvent.input), true);
assert.equal(observedContext.hasUI, false);
assert.equal(observedContext.sessionManager.getSessionId(), "child-session");
assert.equal(observedContext.localProtocolOptions, protocolOptions);

const localUi = {
  timeoutStartsOnPresentation: true,
  async custom(factory) {
    const completion = Promise.withResolvers();
    let component;
    const done = value => {
      component?.dispose?.();
      completion.resolve(value);
    };
    component = await factory(
      {},
      { fg: (_color, text) => text, bold: text => text },
      {},
      done,
    );
    queueMicrotask(() => component.handleInput("a"));
    return completion.promise;
  },
};
runner.initialize(actions, contextActions, undefined, localUi);
const ordinaryTarget = join(agentRoot, "ordinary.txt");
writeFileSync(ordinaryTarget, "before");
const rawOrdinaryInput = {
  input: "¶" + ordinaryTarget + "#ABCD\\nSWAP 1.=1:\\n+after",
};
await wrapped.execute(
  "approved-execution",
  rawOrdinaryInput,
  new AbortController().signal,
  undefined,
  yoloContext,
);
assert.equal(sideEffects, 1);
assert.equal(sessionRecords.length, 2);
assert.equal(observedEvent.toolCallId, "approved-execution");
assert.equal(executedInput.input, observedEvent.input.input);
assert.equal(observedEvent.input.path, ordinaryTarget);
assert.deepEqual(observedEvent.input.paths, [ordinaryTarget]);

const rawMultiInput = {
  input:
    "¶" +
    ordinaryTarget +
    "#ABCD\\nSWAP 1.=1:\\n+first\\n¶SECOND_TARGET#EF12\\nSWAP 1.=1:\\n+second",
};
await wrapped.execute(
  "approved-multi-execution",
  rawMultiInput,
  new AbortController().signal,
  undefined,
  yoloContext,
);
assert.equal(sideEffects, 2);
assert.equal(sessionRecords.length, 3);
assert.equal(observedEvent.toolCallId, "approved-multi-execution");
assert.equal(executedInput.input, observedEvent.input.input);
assert.deepEqual(observedEvent.input.paths, [ordinaryTarget, secondTarget]);

let executedWrite;
const writeTool = {
  name: "write",
  label: "Write",
  description: "Canary write",
  parameters: {},
  async execute(_toolCallId, input) {
    executedWrite = input;
    writeFileSync(input.path, input.content);
    sideEffects += 1;
    return { content: [{ type: "text", text: "written" }] };
  },
};
const wrappedWrite = new ExtensionToolWrapper(writeTool, runner);
const writeTarget = join(agentRoot, "write-target.txt");
await wrappedWrite.execute(
  "write-execution",
  { path: writeTarget, content: "written" },
  new AbortController().signal,
  undefined,
  yoloContext,
);
assert.equal(sideEffects, 3);
assert.equal(observedEvent.toolCallId, "write-execution");
assert.equal(observedEvent.input.path, executedWrite.path);
assert.equal(readFileSync(writeTarget, "utf8"), "written");

console.log(JSON.stringify({
  discovered: true,
  nativeDenyBeforeHook: true,
  normalizedIdentity: true,
  productionUiTrust: true,
  headlessChildProtocol: true,
}));
process.exit(0);
`,
      );
      const guardianEntry = join(extensionsRoot, "guardian.ts");
      const result = spawnSync("bun", [scriptPath, agentRoot, extensionsRoot, guardianEntry], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, HOME: join(sandbox, "home") },
        timeout: 30_000,
      });

      assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
      const output = JSON.parse(result.stdout.trim()) as Record<string, boolean>;
      assert.deepEqual(output, {
        discovered: true,
        nativeDenyBeforeHook: true,
        normalizedIdentity: true,
        productionUiTrust: true,
        headlessChildProtocol: true,
      });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
