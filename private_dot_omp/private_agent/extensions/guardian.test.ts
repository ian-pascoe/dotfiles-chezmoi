import assert from "node:assert/strict";
import { describe, test, vi } from "vitest";

import type { Model } from "@oh-my-pi/pi-ai";

vi.mock("@oh-my-pi/pi-ai", () => ({ completeSimple: vi.fn() }));

import { registerGuardian } from "./guardian";
import type { GuardianAuditRecord } from "./guardian/audit";
import { parseGuardianConfig, type GuardianConfig, type ReviewerIdentity } from "./guardian/policy";
import type { GuardianReviewResult, GuardianVerdict } from "./guardian/review";

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
  trustedLocalUI?: boolean;
  confirm?: (title: string, message: string, options: Record<string, unknown>) => Promise<boolean>;
  primaryModel?: Model | null;
  fallbackModel?: Model | null;
  review?: (input: unknown) => Promise<GuardianReviewResult>;
  failAudit?: boolean;
  sessionId?: string;
};

type TestHandler = (event: unknown, ctx: unknown) => unknown | Promise<unknown>;

function createHarness(options: HarnessOptions = {}) {
  const handlers = new Map<string, TestHandler[]>();
  const sessionRecords: GuardianAuditRecord[] = [];
  const operationalRecords: GuardianAuditRecord[] = [];
  const resolutionOrder: string[] = [];
  const reviewCalls: unknown[] = [];
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
  registerGuardian(api as never, {
    config: options.guardianConfig === undefined ? config() : options.guardianConfig,
    guardianRoot: process.cwd(),
    review: review as never,
    trustedLocalUI: () => options.trustedLocalUI ?? options.hasUI ?? false,
    auditTargets: {
      appendSession(record) {
        if (options.failAudit) throw new Error("audit unavailable");
        sessionRecords.push(record);
      },
      appendOperational(record) {
        if (options.failAudit) throw new Error("audit unavailable");
        operationalRecords.push(record);
      },
    },
  });

  const ctx = {
    cwd: process.cwd(),
    hasUI: options.hasUI ?? false,
    ui: {
      async select(title: string, _items: string[], dialogOptions: Record<string, unknown>) {
        confirmMessages.push(title);
        return (await confirm(title, "", dialogOptions)) ? "Allow once" : "Deny";
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
    modelRegistry: { resolver: () => async () => "test-key" },
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
    sessionRecords,
    setSessionId(value: string) {
      currentSessionId = value;
    },
    start,
    toolCall,
  };
}

describe("Guardian extension enforcement", () => {
  test("leaves ordinary reads outside Guardian and audits exact static bypass", async () => {
    const harness = createHarness();
    await harness.start();

    const readResult = await harness.toolCall("read", { path: "package.json" }, "read-1");
    const statusResult = await harness.toolCall("bash", { command: "git status" }, "status-1");

    assert.equal(readResult, undefined);
    assert.equal(statusResult, undefined);
    assert.equal(harness.review.mock.calls.length, 0);
    assert.equal(harness.sessionRecords.length, 1);
    assert.equal(harness.sessionRecords[0]?.disposition, "static_bypass");
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
      hasUI: true,
      trustedLocalUI: false,
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

  test("distinguishes operator denial, dismissal, and timeout without caching approval", async () => {
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
      {
        expected: "prompt_timeout",
        confirm: async (_title, _message, dialogOptions) => {
          const onTimeout = dialogOptions.onTimeout;
          if (typeof onTimeout === "function") onTimeout();
          return false;
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
    let resolveReview: ((result: GuardianReviewResult) => void) | undefined;
    const harness = createHarness({
      review: async () =>
        new Promise<GuardianReviewResult>((resolveReviewPromise) => {
          resolveReview = resolveReviewPromise;
        }),
    });
    await harness.start();

    const pending = harness.toolCall("bash", { command: "git push" }, "branch-1");
    await vi.waitFor(() => assert.equal(harness.review.mock.calls.length, 1));
    await harness.emit("session_before_branch", { type: "session_before_branch" });
    resolveReview?.({ ok: true, verdict: verdict(), reviewer });
    const result = await pending;

    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /session_invalidated/);
    assert.equal(harness.sessionRecords.length, 0);
  });

  test("freezes reviewed input against downstream mutation", async () => {
    let resolveReview: ((result: GuardianReviewResult) => void) | undefined;
    const harness = createHarness({
      review: async () =>
        new Promise<GuardianReviewResult>((resolveReviewPromise) => {
          resolveReview = resolveReviewPromise;
        }),
    });
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
    resolveReview?.({ ok: true, verdict: verdict(), reviewer });
    const result = await pending;

    assert.equal(result, undefined);
    assert.equal(harness.sessionRecords[0]?.disposition, "model_allow");
  });
});
