import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  MessageEndEvent,
  MessageUpdateEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from "@oh-my-pi/pi-coding-agent";
import type { Model } from "@oh-my-pi/pi-ai";

import {
  createGuardianAuditTargets,
  encodeForTrustedTerminal,
  persistGuardianAudit,
  type GuardianAuditDisposition,
  type GuardianAuditReason,
  type GuardianAuditTargets,
} from "./guardian/audit";
import {
  canonicalCacheIdentity,
  classifyAction,
  parseGuardianConfig,
  reduceVerdict,
  reviewerIsAllowed,
  type GuardianConfig,
  type ReviewerIdentity,
  type ToolAction,
} from "./guardian/policy";
import {
  reviewWithGuardian,
  reviewerIdentity,
  type GuardianReviewResult,
  type GuardianVerdict,
} from "./guardian/review";
import { GuardianSessionRuntime, type DecisionAttempt } from "./guardian/session-runtime";

const UI_TIMEOUT_MS = 20_000;
const RISK_RANK: Record<GuardianVerdict["risk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export type GuardianRegistrationOptions = {
  config?: GuardianConfig | null;
  guardianRoot?: string;
  auditTargets?: GuardianAuditTargets;
  review?: typeof reviewWithGuardian;
  runtime?: GuardianSessionRuntime;
  trustedLocalUI?: (ctx: ExtensionContext) => boolean;
};

type SelectedReviewer = {
  model: Model;
  identity: ReviewerIdentity;
};

type GuardianMessage = MessageUpdateEvent["message"] | MessageEndEvent["message"];

type PromptResolution = {
  approved: boolean;
  disposition: GuardianAuditDisposition;
  reason: GuardianAuditReason;
};

function blocked(reason: GuardianAuditReason): ToolCallEventResult {
  return { block: true, reason: `Guardian blocked the protected action (${reason}).` };
}

function messageText(message: GuardianMessage): string {
  if (!("content" in message)) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}

function loadGuardianConfig(): GuardianConfig | null {
  try {
    const parsed = parseGuardianConfig(
      JSON.parse(readFileSync(new URL("./guardian.config.json", import.meta.url), "utf8")),
    );
    return parsed.ok ? parsed.config : null;
  } catch {
    return null;
  }
}

function selectReviewer(ctx: ExtensionContext, config: GuardianConfig): SelectedReviewer | null {
  const primary = ctx.models.resolve("@guardian");
  const model = primary ?? ctx.models.resolve("@smol");
  if (!model) return null;
  const identity = reviewerIdentity(model);
  return reviewerIsAllowed(config, identity) ? { model, identity } : null;
}

function constrainedVerdict(
  config: GuardianConfig,
  toolName: string,
  verdict: GuardianVerdict,
): { verdict: GuardianVerdict; forcePrompt: boolean } {
  const matching = config.rules.filter((rule) => rule.tool === toolName);
  const forcePrompt = matching.some((rule) => rule.effect === "confirm");
  let risk = verdict.risk;
  for (const rule of matching) {
    if (rule.effect === "minimum-risk" && RISK_RANK[rule.risk] > RISK_RANK[risk]) risk = rule.risk;
  }
  return { verdict: risk === verdict.risk ? verdict : { ...verdict, risk }, forcePrompt };
}

function reviewFailureReason(
  result: Extract<GuardianReviewResult, { ok: false }>,
): GuardianAuditReason {
  if (result.reason === "timeout") return "timeout";
  if (result.reason === "cancelled") return "cancelled";
  if (result.reason === "invalid-request") return "invalid_action";
  if (result.reason === "invalid-response") return "invalid_response";
  return result.reason === "provider-error" ? "provider_failure" : "provider_unavailable";
}

function finalizeAttempt(
  runtime: GuardianSessionRuntime,
  attempt: DecisionAttempt,
  liveAction: ToolAction,
  targets: GuardianAuditTargets,
  disposition: GuardianAuditDisposition,
  reason: GuardianAuditReason,
  allow: boolean,
  risk?: GuardianVerdict["risk"],
  reviewer?: ReviewerIdentity,
): ToolCallEventResult | undefined {
  if (!runtime.claimTerminal(attempt, liveAction)) return blocked("session_invalidated");
  const audit = persistGuardianAudit(
    {
      sessionId: runtime.sessionId,
      generation: runtime.generation,
      actionFingerprint: attempt.actionFingerprint,
      toolName: attempt.action.toolName,
      disposition,
      reason,
      risk,
      reviewer,
      latencyMs: Date.now() - attempt.startedAt,
    },
    (value) => runtime.auditTag(value),
    targets,
  );
  if (!audit.ok) return blocked("audit_failure");
  return allow ? undefined : blocked(reason);
}

function deepFreeze(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  Object.freeze(value);
}

function freezeToolCall(event: ToolCallEvent): void {
  deepFreeze(event.input);
  Object.freeze(event);
}

function isTrustedLocalUI(ctx: ExtensionContext): boolean {
  return ctx.hasUI && process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function promptOperator(
  ctx: ExtensionContext,
  attempt: DecisionAttempt,
  action: ToolAction,
  rationale: string,
  maxExactActionBytes: number,
): Promise<PromptResolution> {
  let timedOut = false;
  try {
    const choice = await ctx.ui.select(
      `Guardian approval required\nExact protected action:\n${encodeForTrustedTerminal(action, maxExactActionBytes * 6 + 1_024)}\n\nAssessment:\n${encodeForTrustedTerminal(rationale, 2_048)}`,
      ["Deny", "Allow once"],
      {
        initialIndex: 0,
        signal: attempt.controller.signal,
        timeout: UI_TIMEOUT_MS,
        onTimeout: () => {
          timedOut = true;
        },
      },
    );
    if (choice === "Allow once")
      return { approved: true, disposition: "prompt_approve", reason: "operator_approved" };
    if (timedOut)
      return { approved: false, disposition: "prompt_timeout", reason: "operator_timeout" };
    return choice === "Deny"
      ? { approved: false, disposition: "prompt_deny", reason: "operator_denied" }
      : { approved: false, disposition: "prompt_dismiss", reason: "operator_dismissed" };
  } catch {
    return { approved: false, disposition: "prompt_dismiss", reason: "operator_dismissed" };
  }
}

function staticBlockReason(signals: string[]): GuardianAuditReason {
  if (signals.includes("oversized-exact-action")) return "action_too_large";
  if (signals.includes("configured-deny")) return "explicit_deny";
  if (signals.some((signal) => signal.includes("xdev"))) return "invalid_config";
  return "invalid_action";
}

export function registerGuardian(
  pi: ExtensionAPI,
  options: GuardianRegistrationOptions = {},
): GuardianSessionRuntime {
  const runtime = options.runtime ?? new GuardianSessionRuntime();
  const config = options.config === undefined ? loadGuardianConfig() : options.config;
  const guardianRoot = options.guardianRoot ?? resolve(import.meta.dirname, "..");
  let targets: GuardianAuditTargets | null = options.auditTargets ?? null;
  if (!targets) {
    try {
      targets = createGuardianAuditTargets(pi, resolve(guardianRoot, "audit", "guardian.jsonl"));
    } catch {
      targets = null;
    }
  }
  const review = options.review ?? reviewWithGuardian;
  const trustedLocalUI = options.trustedLocalUI ?? isTrustedLocalUI;

  pi.on("session_start", (_event, ctx) => {
    runtime.reset(ctx.sessionManager.getSessionId());
  });
  pi.on("session_before_switch", () => {
    runtime.dispose();
  });
  pi.on("session_switch", (_event, ctx) => {
    runtime.reset(ctx.sessionManager.getSessionId());
  });
  pi.on("session_before_branch", () => {
    runtime.dispose();
  });
  pi.on("session_branch", (_event, ctx) => {
    runtime.reset(ctx.sessionManager.getSessionId());
  });
  pi.on("session_before_tree", () => {
    runtime.dispose();
  });
  pi.on("session_tree", (_event, ctx) => {
    runtime.reset(ctx.sessionManager.getSessionId());
  });
  pi.on("session_shutdown", () => {
    runtime.dispose();
  });
  pi.on("before_agent_start", (event) => {
    runtime.startTurn(event.prompt);
  });
  pi.on("message_update", (event: MessageUpdateEvent) => {
    if (event.message.role === "assistant")
      runtime.updateAssistantIntent(messageText(event.message));
  });
  pi.on("message_end", (event: MessageEndEvent) => {
    if (event.message.role === "assistant")
      runtime.updateAssistantIntent(messageText(event.message));
  });

  pi.on(
    "tool_call",
    async (
      event: ToolCallEvent,
      ctx: ExtensionContext,
    ): Promise<ToolCallEventResult | undefined> => {
      const canPrompt = trustedLocalUI(ctx);
      const liveAction: ToolAction = { toolName: event.toolName, input: event.input, cwd: ctx.cwd };
      if (!runtime.ready || targets === null) return blocked("invalid_config");
      const attempt = runtime.beginAttempt(event.toolCallId, liveAction);
      if (!attempt) return blocked("invalid_action");
      try {
        freezeToolCall(event);
      } catch {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "static_block",
          "invalid_action",
          false,
        );
      }
      if (!config) {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "static_block",
          "invalid_config",
          false,
        );
      }

      let staticDecision;
      try {
        staticDecision = classifyAction(attempt.action, {
          workspaceRoot: ctx.cwd,
          guardianRoot,
          config,
        });
      } catch {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "static_block",
          "invalid_config",
          false,
        );
      }
      if (staticDecision.outcome === "unprotected") {
        runtime.abandon(attempt, "Unprotected action");
        return undefined;
      }
      if (staticDecision.outcome === "safe-bypass") {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "static_bypass",
          "safe_rule",
          true,
        );
      }
      if (staticDecision.outcome === "block") {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "static_block",
          staticBlockReason(staticDecision.signals),
          false,
        );
      }

      const deadlineAt = Date.now() + config.maxReviewDurationMs;
      const deadlineController = new AbortController();
      const deadlineTimer = setTimeout(
        () => deadlineController.abort(new Error("Guardian review deadline exceeded")),
        config.maxReviewDurationMs,
      );
      const reviewSignal = AbortSignal.any([attempt.controller.signal, deadlineController.signal]);
      const selected = selectReviewer(ctx, config);
      if (!selected) {
        clearTimeout(deadlineTimer);
        const reason = "provider_unavailable";
        if (!canPrompt)
          return finalizeAttempt(
            runtime,
            attempt,
            liveAction,
            targets,
            "review_failure",
            reason,
            false,
          );
        const prompt = await promptOperator(
          ctx,
          attempt,
          attempt.action,
          "Reviewer provider unavailable; approve only if the exact action is intended.",
          config.maxExactActionBytes,
        );
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          prompt.disposition,
          prompt.reason,
          prompt.approved,
        );
      }

      const intent = runtime.intentEvidence();
      const cacheKey = canonicalCacheIdentity({
        action: attempt.action,
        intentFingerprint: runtime.auditTag(intent),
        policyFingerprint: config.policyFingerprint,
        schemaVersion: "guardian-verdict/v1",
        reviewer: selected.identity,
        session: { id: runtime.sessionId, generation: runtime.generation },
      });
      if (cacheKey === null) {
        clearTimeout(deadlineTimer);
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "review_failure",
          "invalid_action",
          false,
          undefined,
          selected.identity,
        );
      }

      let assessment = runtime.cached(cacheKey);
      let source: "cached" | "model" = "cached";
      if (!assessment) {
        const remaining = deadlineAt - Date.now();
        let result: GuardianReviewResult;
        if (remaining < 1 || reviewSignal.aborted)
          result = {
            ok: false,
            reason: deadlineController.signal.aborted ? "timeout" : "cancelled",
          };
        else {
          result = await review({
            model: selected.model,
            apiKey: ctx.modelRegistry.resolver(selected.model, runtime.sessionId),
            sessionId: runtime.sessionId,
            deadlineMs: remaining,
            action: attempt.action,
            intent,
            policy: {
              schemaVersion: config.schemaVersion,
              basePolicyVersion: config.basePolicyVersion,
              policyFingerprint: config.policyFingerprint,
              signals: staticDecision.signals,
            },
            signal: reviewSignal,
          });
        }
        if (deadlineController.signal.aborted || Date.now() >= deadlineAt) {
          result = { ok: false, reason: "timeout" };
        }
        clearTimeout(deadlineTimer);
        if (!result.ok) {
          const reason = reviewFailureReason(result);
          if (!canPrompt)
            return finalizeAttempt(
              runtime,
              attempt,
              liveAction,
              targets,
              "review_failure",
              reason,
              false,
              undefined,
              selected.identity,
            );
          const prompt = await promptOperator(
            ctx,
            attempt,
            attempt.action,
            `Guardian review failed (${reason}); approve only if the exact action is intended.`,
            config.maxExactActionBytes,
          );
          return finalizeAttempt(
            runtime,
            attempt,
            liveAction,
            targets,
            prompt.disposition,
            prompt.reason,
            prompt.approved,
            undefined,
            selected.identity,
          );
        }
        if (
          !reviewerIsAllowed(config, result.reviewer) ||
          result.reviewer.provider !== selected.identity.provider ||
          result.reviewer.model !== selected.identity.model ||
          result.reviewer.endpoint !== selected.identity.endpoint ||
          result.reviewer.effort !== selected.identity.effort ||
          !runtime.isCurrent(attempt, liveAction)
        ) {
          runtime.abandon(attempt, "Guardian reviewer identity or session mismatch");
          return blocked("session_invalidated");
        }
        assessment = { verdict: result.verdict, reviewer: result.reviewer };
        runtime.cache(cacheKey, assessment);
        source = "model";
      } else {
        clearTimeout(deadlineTimer);
      }

      const constrained = constrainedVerdict(config, event.toolName, assessment.verdict);
      const reduction = reduceVerdict(
        {
          risk: constrained.verdict.risk,
          authorized: constrained.verdict.authorized,
          outcome: constrained.verdict.outcome,
        },
        canPrompt,
      );
      if (reduction === "auto-allow" && !constrained.forcePrompt) {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          source === "cached" ? "cached_allow" : "model_allow",
          "authorized",
          true,
          constrained.verdict.risk,
          assessment.reviewer,
        );
      }
      if (reduction === "block") {
        const reason =
          constrained.verdict.risk === "critical"
            ? "critical_risk"
            : constrained.verdict.outcome === "deny"
              ? "explicit_deny"
              : "high_risk";
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          source === "cached" ? "cached_block" : "model_block",
          reason,
          false,
          constrained.verdict.risk,
          assessment.reviewer,
        );
      }
      if (!canPrompt) {
        return finalizeAttempt(
          runtime,
          attempt,
          liveAction,
          targets,
          "model_block",
          "uncertain",
          false,
          constrained.verdict.risk,
          assessment.reviewer,
        );
      }
      const prompt = await promptOperator(
        ctx,
        attempt,
        attempt.action,
        constrained.verdict.reason,
        config.maxExactActionBytes,
      );
      return finalizeAttempt(
        runtime,
        attempt,
        liveAction,
        targets,
        prompt.disposition,
        prompt.reason,
        prompt.approved,
        constrained.verdict.risk,
        assessment.reviewer,
      );
    },
  );

  return runtime;
}

export default function guardian(pi: ExtensionAPI): void {
  registerGuardian(pi);
}
