import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

import type { ReviewerIdentity } from "./policy";

const KNOWN_TOOL_NAMES: Record<string, true> = {
  ast_edit: true,
  bash: true,
  browser: true,
  debug: true,
  edit: true,
  eval: true,
  glob: true,
  grep: true,
  read: true,
  task: true,
  todo: true,
  web_search: true,
  write: true,
};

export type GuardianAuditDisposition =
  | "cached_allow"
  | "cached_block"
  | "model_allow"
  | "model_block"
  | "prompt_approve"
  | "prompt_deny"
  | "prompt_dismiss"
  | "prompt_timeout"
  | "review_failure"
  | "static_block"
  | "static_bypass";

export type GuardianAuditSource = "cache" | "failure" | "model" | "operator" | "static";

export type GuardianAuditOutcome = "allow" | "block";

export type GuardianAuditCacheStatus = "hit" | "miss" | "not-applicable";

export type GuardianAuditReason =
  | "action_too_large"
  | "audit_failure"
  | "cancelled"
  | "critical_risk"
  | "authorized"
  | "explicit_deny"
  | "high_risk"
  | "invalid_action"
  | "invalid_config"
  | "invalid_response"
  | "operator_approved"
  | "operator_denied"
  | "operator_dismissed"
  | "operator_timeout"
  | "provider_failure"
  | "provider_unavailable"
  | "safe_rule"
  | "session_invalidated"
  | "timeout"
  | "uncertain";

export type GuardianAuditInput = {
  sessionId: string;
  generation: number;
  actionFingerprint: string;
  toolName: string;
  disposition: GuardianAuditDisposition;
  reason: GuardianAuditReason;
  risk?: "low" | "medium" | "high" | "critical";
  reviewer?: ReviewerIdentity;
  latencyMs: number;
};

export type GuardianAuditRecord = {
  schemaVersion: "guardian-decision/v1";
  eventId: string;
  timestamp: string;
  sessionTag: string;
  generation: number;
  actionTag: string;
  tool: string;
  disposition: GuardianAuditDisposition;
  source: GuardianAuditSource;
  outcome: GuardianAuditOutcome;
  cacheStatus: GuardianAuditCacheStatus;
  reason: GuardianAuditReason;
  risk: "none" | "low" | "medium" | "high" | "critical";
  reviewerTag: string | null;
  latencyMs: number;
};

export type GuardianAuditTargets = {
  appendSession(record: GuardianAuditRecord): void;
  appendOperational(record: GuardianAuditRecord): void;
};

export function encodeForTrustedTerminal(value: unknown, maxCharacters = 393_216): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return "<unrenderable>";
  }
  if (serialized === undefined) return "<unrenderable>";
  let encoded = "";
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    encoded +=
      code >= 0x20 && code <= 0x7e ? serialized[index] : `\\u${code.toString(16).padStart(4, "0")}`;
    if (encoded.length > maxCharacters) return `${encoded.slice(0, maxCharacters)}[truncated]`;
  }
  return encoded;
}

function auditSource(disposition: GuardianAuditDisposition): GuardianAuditSource {
  if (disposition.startsWith("static_")) return "static";
  if (disposition.startsWith("cached_")) return "cache";
  if (disposition.startsWith("model_")) return "model";
  if (disposition.startsWith("prompt_")) return "operator";
  return "failure";
}

function auditOutcome(disposition: GuardianAuditDisposition): GuardianAuditOutcome {
  return disposition === "static_bypass" ||
    disposition === "cached_allow" ||
    disposition === "model_allow" ||
    disposition === "prompt_approve"
    ? "allow"
    : "block";
}

function auditCacheStatus(disposition: GuardianAuditDisposition): GuardianAuditCacheStatus {
  if (disposition.startsWith("cached_")) return "hit";
  return disposition.startsWith("static_") ? "not-applicable" : "miss";
}

export function persistGuardianAudit(
  input: GuardianAuditInput,
  sign: (value: string) => string,
  targets: GuardianAuditTargets,
): { ok: true; record: GuardianAuditRecord } | { ok: false; reason: "audit_failure" } {
  const reviewerMaterial = input.reviewer
    ? JSON.stringify({
        provider: input.reviewer.provider,
        model: input.reviewer.model,
        endpoint: input.reviewer.endpoint,
        effort: input.reviewer.effort,
      })
    : null;
  const record: GuardianAuditRecord = {
    schemaVersion: "guardian-decision/v1",
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    sessionTag: sign(input.sessionId),
    generation: input.generation,
    actionTag: sign(input.actionFingerprint),
    tool: Object.hasOwn(KNOWN_TOOL_NAMES, input.toolName) ? input.toolName : "other",
    disposition: input.disposition,
    source: auditSource(input.disposition),
    outcome: auditOutcome(input.disposition),
    cacheStatus: auditCacheStatus(input.disposition),
    reason: input.reason,
    risk: input.risk ?? "none",
    reviewerTag: reviewerMaterial === null ? null : sign(reviewerMaterial),
    latencyMs: Number.isFinite(input.latencyMs) ? Math.max(0, Math.round(input.latencyMs)) : 0,
  };
  let sessionPersisted = true;
  try {
    targets.appendSession(record);
  } catch {
    sessionPersisted = false;
  }
  try {
    targets.appendOperational(record);
  } catch {
    // Operational JSONL is best-effort; the host session is the required audit sink.
  }
  return sessionPersisted ? { ok: true, record } : { ok: false, reason: "audit_failure" };
}

export function createGuardianAuditTargets(
  pi: ExtensionAPI,
  auditPath: string,
): GuardianAuditTargets {
  mkdirSync(dirname(auditPath), { recursive: true, mode: 0o700 });
  return {
    appendSession(record) {
      pi.appendEntry("guardian-decision", record);
    },
    appendOperational(record) {
      appendFileSync(auditPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    },
  };
}
