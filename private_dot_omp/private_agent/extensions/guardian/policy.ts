import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const BASE_POLICY_VERSION = "guardian-policy/v1";
export const DEFAULT_MAX_REVIEW_DURATION_MS = 3_000;
export const DEFAULT_MAX_EXACT_ACTION_BYTES = 65_536;

const CONFIG_KEYS = new Set([
  "schemaVersion",
  "providerDataAcknowledged",
  "allowedReviewers",
  "maxReviewDurationMs",
  "maxExactActionBytes",
  "protectedTools",
  "rules",
]);
const SAFE_GIT_STATUS = new Set([
  "git status",
  "git status --short",
  "git status --porcelain",
  "git status --porcelain=v1",
  "git status --short --branch",
  "git status --porcelain=v1 --branch",
]);
const CATASTROPHIC_SHELL =
  /(?:^|\s)(?:rm\s+-[^\n]*r[^\n]*f|mkfs(?:\.|\s)|dd\s+[^\n]*\bof=\/dev\/|shutdown|reboot)(?:\s|$)/;
const RISKS = new Set(["low", "medium", "high", "critical"]);

type JsonRecord = Record<string, unknown>;

export type ToolAction = {
  toolName: string;
  input: unknown;
  cwd: string;
};

export type ReviewerIdentity = {
  provider: string;
  model: string;
  endpoint: string;
  effort: string;
};

export type GuardianRule =
  | { effect: "deny" | "confirm"; tool: string }
  | { effect: "minimum-risk"; tool: string; risk: "medium" | "high" | "critical" };

export type GuardianConfig = {
  schemaVersion: "guardian-config/v1";
  basePolicyVersion: typeof BASE_POLICY_VERSION;
  providerDataAcknowledged: true;
  allowedReviewers: Array<{ provider: string; model: string }>;
  maxReviewDurationMs: number;
  maxExactActionBytes: number;
  protectedTools: string[];
  rules: GuardianRule[];
  policyFingerprint: string;
};

export type ConfigParseResult =
  | { ok: true; config: GuardianConfig }
  | { ok: false; errors: string[] };

export type StaticDecision = {
  outcome: "unprotected" | "safe-bypass" | "escalate" | "block";
  signals: string[];
};

export type CacheIdentityInput = {
  action: ToolAction;
  intentFingerprint: string;
  policyFingerprint: string;
  schemaVersion: string;
  reviewer: ReviewerIdentity;
  session?: { id: string; generation: number };
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function stableValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical values must contain finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical values must be lossless JSON values");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableValue(value)).digest("hex");
}

export function canonicalActionFingerprint(action: ToolAction): string | null {
  try {
    return fingerprint(action);
  } catch {
    return null;
  }
}

function validReviewer(value: unknown): value is { provider: string; model: string } {
  return (
    isRecord(value) &&
    exactKeys(value, ["provider", "model"]) &&
    typeof value.provider === "string" &&
    value.provider.length > 0 &&
    typeof value.model === "string" &&
    value.model.length > 0
  );
}

function validRule(value: unknown): value is GuardianRule {
  if (
    !isRecord(value) ||
    typeof value.effect !== "string" ||
    typeof value.tool !== "string" ||
    value.tool.length === 0
  )
    return false;
  if (value.effect === "deny" || value.effect === "confirm")
    return exactKeys(value, ["effect", "tool"]);
  return (
    value.effect === "minimum-risk" &&
    exactKeys(value, ["effect", "tool", "risk"]) &&
    (value.risk === "medium" || value.risk === "high" || value.risk === "critical")
  );
}

export function parseGuardianConfig(value: unknown): ConfigParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["configuration must be an object"] };
  for (const key of Object.keys(value))
    if (!CONFIG_KEYS.has(key)) errors.push(`unknown key: ${key}`);
  if (value.schemaVersion !== "guardian-config/v1")
    errors.push("schemaVersion must be guardian-config/v1");
  if (value.providerDataAcknowledged !== true)
    errors.push("exact-action provider data handling must be acknowledged");

  const reviewers = value.allowedReviewers;
  if (!Array.isArray(reviewers) || reviewers.length === 0 || !reviewers.every(validReviewer))
    errors.push("allowedReviewers must be a non-empty exact provider/model allowlist");

  const maxReviewDurationMs = value.maxReviewDurationMs ?? DEFAULT_MAX_REVIEW_DURATION_MS;
  if (
    !Number.isInteger(maxReviewDurationMs) ||
    (maxReviewDurationMs as number) < 1 ||
    (maxReviewDurationMs as number) > DEFAULT_MAX_REVIEW_DURATION_MS
  ) {
    errors.push("maxReviewDurationMs may only lower the built-in deadline");
  }
  const maxExactActionBytes = value.maxExactActionBytes ?? DEFAULT_MAX_EXACT_ACTION_BYTES;
  if (
    !Number.isInteger(maxExactActionBytes) ||
    (maxExactActionBytes as number) < 1 ||
    (maxExactActionBytes as number) > DEFAULT_MAX_EXACT_ACTION_BYTES
  ) {
    errors.push("maxExactActionBytes may only lower the built-in bound");
  }
  const protectedTools = value.protectedTools ?? [];
  if (
    !Array.isArray(protectedTools) ||
    !protectedTools.every((item) => typeof item === "string" && item.length > 0)
  )
    errors.push("protectedTools must contain non-empty names");
  const rules = value.rules ?? [];
  if (!Array.isArray(rules) || !rules.every(validRule))
    errors.push("rules may contain only deny, confirm, or medium-and-higher minimum-risk effects");
  if (errors.length > 0) return { ok: false, errors };

  const policyMaterial = {
    basePolicyVersion: BASE_POLICY_VERSION,
    maxReviewDurationMs,
    maxExactActionBytes,
    protectedTools,
    rules,
    allowedReviewers: reviewers,
  };
  return {
    ok: true,
    config: {
      schemaVersion: "guardian-config/v1",
      basePolicyVersion: BASE_POLICY_VERSION,
      providerDataAcknowledged: true,
      allowedReviewers: reviewers as Array<{ provider: string; model: string }>,
      maxReviewDurationMs: maxReviewDurationMs as number,
      maxExactActionBytes: maxExactActionBytes as number,
      protectedTools: protectedTools as string[],
      rules: rules as GuardianRule[],
      policyFingerprint: fingerprint(policyMaterial),
    },
  };
}

export function reviewerIsAllowed(config: GuardianConfig, reviewer: ReviewerIdentity): boolean {
  return (
    config.providerDataAcknowledged &&
    config.allowedReviewers.some(
      ({ provider, model }) => provider === reviewer.provider && model === reviewer.model,
    )
  );
}

export function canonicalCacheIdentity(input: CacheIdentityInput): string | null {
  if (!input.session || input.session.id.trim().length === 0) return null;
  return fingerprint(input);
}

export function exactActionFits(
  action: ToolAction,
  bounds: { providerBytes: number; displayBytes: number },
): boolean {
  if (
    !Number.isInteger(bounds.providerBytes) ||
    !Number.isInteger(bounds.displayBytes) ||
    bounds.providerBytes < 1 ||
    bounds.displayBytes < 1
  )
    return false;
  let bytes: number;
  try {
    bytes = Buffer.byteLength(stableValue(action), "utf8");
  } catch {
    return false;
  }
  return bytes <= bounds.providerBytes && bytes <= bounds.displayBytes;
}

function isContained(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function canonicalTarget(rawPath: string, cwd: string): string | null {
  if (
    rawPath.includes("\0") ||
    rawPath.startsWith("ssh://") ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(rawPath)
  )
    return null;
  if (rawPath.split(/[\\/]+/).includes("..")) return null;
  const absolute = resolve(cwd, rawPath);
  let parent = absolute;
  const tail: string[] = [];
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) return null;
    tail.unshift(relative(next, parent));
    parent = next;
  }
  try {
    return resolve(realpathSync(parent), ...tail);
  } catch {
    return null;
  }
}

function isGuardianTarget(target: string, guardianRoot: string): boolean {
  const config = join(guardianRoot, "extensions", "guardian.config.json");
  const adapter = join(guardianRoot, "extensions", "guardian.ts");
  const policyDir = join(guardianRoot, "extensions", "guardian");
  const auditDir = join(guardianRoot, "audit");
  return (
    target === config ||
    target === adapter ||
    isContained(policyDir, target) ||
    isContained(auditDir, target)
  );
}

function configuredOutcome(
  toolName: string,
  config: GuardianConfig,
): StaticDecision["outcome"] | null {
  const effects = config.rules.filter((rule) => rule.tool === toolName);
  if (effects.some((rule) => rule.effect === "deny")) return "block";
  if (effects.length > 0 || config.protectedTools.includes(toolName)) return "escalate";
  return null;
}

export function classifyAction(
  action: ToolAction,
  options: { workspaceRoot: string; guardianRoot?: string; config: GuardianConfig },
): StaticDecision {
  const { config } = options;
  if (
    !exactActionFits(action, {
      providerBytes: config.maxExactActionBytes,
      displayBytes: config.maxExactActionBytes,
    })
  ) {
    return { outcome: "block", signals: ["oversized-exact-action"] };
  }
  if (
    typeof action.toolName !== "string" ||
    action.toolName.length === 0 ||
    typeof action.cwd !== "string" ||
    !isRecord(action.input)
  ) {
    return { outcome: "escalate", signals: ["unknown-shape"] };
  }
  const configured = configuredOutcome(action.toolName, config);
  if (configured === "block") return { outcome: "block", signals: ["configured-deny"] };

  const workspace = realpathSync(options.workspaceRoot);
  const guardianRoot = resolve(options.guardianRoot ?? join(workspace, ".omp", "agent"));
  const input = action.input;

  if (
    action.toolName === "write" &&
    typeof input.path === "string" &&
    input.path.startsWith("xd://")
  ) {
    if (input.path === "xd://reject")
      return { outcome: "block", signals: ["explicit-xdev-reject"] };
    if (input.path === "xd://proposal") return { outcome: "escalate", signals: ["xdev-proposal"] };
    return { outcome: "block", signals: ["invalid-executable-xdev"] };
  }

  if (action.toolName === "read") {
    const exact = exactKeys(input, ["path"], ["selector"]);
    const local = typeof input.path === "string" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(input.path);
    const selector = input.selector === undefined || typeof input.selector === "string";
    const outcome = exact && local && selector && configured === null ? "unprotected" : "escalate";
    return { outcome, signals: outcome === "unprotected" ? [] : ["non-local-or-unknown-read"] };
  }

  if (action.toolName === "write" || action.toolName === "edit") {
    const exact =
      action.toolName === "write"
        ? exactKeys(input, ["path", "content"]) && typeof input.content === "string"
        : exactKeys(input, ["path", "input"]) && typeof input.input === "string";
    if (!exact || typeof input.path !== "string")
      return { outcome: "escalate", signals: ["unknown-write-shape"] };
    const target = canonicalTarget(input.path, action.cwd);
    if (!target || !isContained(workspace, target) || isGuardianTarget(target, guardianRoot)) {
      return { outcome: "escalate", signals: ["non-contained-or-protected-write"] };
    }
    return configured === null
      ? { outcome: "unprotected", signals: [] }
      : { outcome: "escalate", signals: ["configured-confirmation"] };
  }

  if (action.toolName === "bash") {
    const command = input.command;
    const safeShape = exactKeys(input, ["command"]) && typeof command === "string";
    const cwd = canonicalTarget(action.cwd, action.cwd);
    if (
      configured === null &&
      safeShape &&
      cwd &&
      isContained(workspace, cwd) &&
      SAFE_GIT_STATUS.has(command)
    ) {
      return { outcome: "safe-bypass", signals: ["exact-git-status"] };
    }
    return {
      outcome: "escalate",
      signals:
        typeof command === "string" && CATASTROPHIC_SHELL.test(command)
          ? ["catastrophic-pattern"]
          : ["protected-execution"],
    };
  }

  return {
    outcome: "escalate",
    signals: [configured ? "configured-protected" : "protected-or-unknown-tool"],
  };
}

export function reduceVerdict(
  value: unknown,
  trustedLocalUiAvailable: boolean,
): "auto-allow" | "prompt" | "block" | "uncertain" {
  if (!isRecord(value) || !exactKeys(value, ["risk", "authorized", "outcome"])) return "uncertain";
  if (
    !RISKS.has(value.risk as string) ||
    typeof value.authorized !== "boolean" ||
    (value.outcome !== "allow" && value.outcome !== "deny")
  )
    return "uncertain";
  if (value.outcome === "deny" || value.risk === "critical") return "block";
  if (value.risk === "high") return trustedLocalUiAvailable ? "prompt" : "block";
  return value.authorized ? "auto-allow" : "uncertain";
}
