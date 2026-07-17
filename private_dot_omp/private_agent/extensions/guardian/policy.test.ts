import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "vitest";

import {
  BASE_POLICY_VERSION,
  canonicalCacheIdentity,
  classifyAction,
  exactActionFits,
  parseGuardianConfig,
  reduceVerdict,
  reviewerIsAllowed,
  type GuardianConfig,
  type ReviewerIdentity,
  type ToolAction,
} from "./policy";

const repoRoot = realpathSync(join(import.meta.dirname, "../../../../"));
const temporaryRoots: string[] = [];

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "guardian-policy-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, ".omp", "agent", "extensions", "guardian"), { recursive: true });
  mkdirSync(join(root, ".omp", "agent", "audit"), { recursive: true });
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "existing.ts"), "export {}\n");
  return root;
}

function action(toolName: string, input: unknown, cwd: string): ToolAction {
  return { toolName, input, cwd };
}

function validConfig(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: "guardian-config/v1",
    providerDataAcknowledged: true,
    allowedReviewers: [
      { provider: "openai-codex", model: "gpt-5.6-luna" },
      { provider: "openai-codex", model: "gpt-5.6-sol" },
    ],
    ...overrides,
  };
}

function parsedConfig(overrides: Record<string, unknown> = {}): GuardianConfig {
  const result = parseGuardianConfig(validConfig(overrides));
  if (!result.ok) assert.fail(result.errors.join("; "));
  return result.config;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Guardian closed static policy", () => {
  test("classifies only exact ordinary local read shapes as unprotected", () => {
    const root = workspace();
    const config = parsedConfig();
    const cases: Array<[string, ToolAction, string]> = [
      ["local file", action("read", { path: "src/existing.ts" }, root), "unprotected"],
      [
        "literal selector",
        action("read", { path: "src/existing.ts", selector: "1-2" }, root),
        "unprotected",
      ],
      ["SSH read", action("read", { path: "ssh://host/etc/passwd" }, root), "escalate"],
      ["web read", action("read", { path: "https://example.com" }, root), "escalate"],
      [
        "unknown read field",
        action("read", { path: "src/existing.ts", raw: true }, root),
        "escalate",
      ],
      ["wrong read type", action("read", { path: ["src/existing.ts"] }, root), "escalate"],
      ["unknown tool", action("future_tool", { path: "src/existing.ts" }, root), "escalate"],
    ];

    for (const [label, candidate, expected] of cases) {
      assert.equal(
        classifyAction(candidate, { workspaceRoot: root, config }).outcome,
        expected,
        label,
      );
    }
  });

  test("bypasses write/edit only for canonically workspace-contained targets", () => {
    const root = workspace();
    const outside = workspace();
    const config = parsedConfig();
    symlinkSync(outside, join(root, "escape"));

    const cases: Array<[string, ToolAction, string]> = [
      [
        "existing write",
        action("write", { path: "src/existing.ts", content: "x" }, root),
        "unprotected",
      ],
      [
        "new write",
        action("write", { path: "src/new/deep.ts", content: "x" }, root),
        "unprotected",
      ],
      [
        "existing edit",
        action("edit", { path: "src/existing.ts", input: "patch" }, root),
        "unprotected",
      ],
      ["new edit", action("edit", { path: "src/new.ts", input: "patch" }, root), "unprotected"],
      [
        "absolute escape",
        action("write", { path: join(outside, "x"), content: "x" }, root),
        "escalate",
      ],
      [
        "parent traversal",
        action("write", { path: "../escape.ts", content: "x" }, root),
        "escalate",
      ],
      [
        "symlink escape existing",
        action("write", { path: "escape/file.ts", content: "x" }, root),
        "escalate",
      ],
      ["SSH write", action("write", { path: "ssh://host/tmp/x", content: "x" }, root), "escalate"],
      [
        "unknown write shape",
        action("write", { path: "src/x", content: "x", mode: 0o600 }, root),
        "escalate",
      ],
    ];

    for (const [label, candidate, expected] of cases) {
      assert.equal(
        classifyAction(candidate, { workspaceRoot: root, config }).outcome,
        expected,
        label,
      );
    }
  });

  test("mirrors strict write hashline wrapper target normalization", () => {
    const root = workspace();
    const outside = workspace();
    const config = parsedConfig();
    const guardianRoot = join(root, ".omp", "agent");
    const cases: Array<[string, string, string]> = [
      ["bare wrapper", "[src/existing.ts]", "unprotected"],
      ["tagged wrapper", "[src/existing.ts#aB12]", "unprotected"],
      ["protected tagged wrapper", "[.omp/agent/extensions/guardian/policy.ts#ABCD]", "escalate"],
      ["outside tagged wrapper", `[${join(outside, "x")}#ABCD]`, "escalate"],
      ["remote tagged wrapper", "[ssh://host/tmp/x#ABCD]", "escalate"],
      ["wrapped executable device", "[xd://browser#ABCD]", "block"],
      ["non-hex tag", "[src/existing.ts#WXYZ]", "escalate"],
      ["wrong tag length", "[src/existing.ts#ABC]", "escalate"],
      ["embedded hash", "[src/existing#name#ABCD]", "escalate"],
      ["leading whitespace", " [src/existing.ts#ABCD]", "escalate"],
    ];

    for (const [label, path, expected] of cases) {
      assert.equal(
        classifyAction(action("write", { path, content: "x" }, root), {
          workspaceRoot: root,
          guardianRoot,
          config,
        }).outcome,
        expected,
        label,
      );
    }
  });

  test("accepts consistent normalized edit targets and protects every target", () => {
    const root = workspace();
    const outside = workspace();
    const config = parsedConfig();
    const guardianRoot = join(root, ".omp", "agent");
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["direct edit", { input: "patch", path: "src/existing.ts" }, "unprotected"],
      ["wrapped direct edit", { input: "patch", path: "[src/existing.ts#ABCD]" }, "unprotected"],
      [
        "wrapped protected direct edit",
        { input: "patch", path: "[.omp/agent/extensions/guardian/policy.ts#ABCD]" },
        "escalate",
      ],
      [
        "normalized single edit",
        { input: "patch", path: "src/existing.ts", paths: ["src/existing.ts"] },
        "unprotected",
      ],
      [
        "normalized multi edit",
        { input: "patch", paths: ["src/existing.ts", "src/new.ts"] },
        "unprotected",
      ],
      [
        "inconsistent normalized single edit",
        { input: "patch", path: "src/existing.ts", paths: ["src/new.ts"] },
        "escalate",
      ],
      ["empty normalized targets", { input: "patch", paths: [] }, "escalate"],
      [
        "outside normalized target",
        { input: "patch", paths: ["src/existing.ts", join(outside, "x")] },
        "escalate",
      ],
      [
        "protected normalized target",
        { input: "patch", paths: ["src/existing.ts", ".omp/agent/audit/log.jsonl"] },
        "escalate",
      ],
      [
        "remote normalized target",
        { input: "patch", paths: ["src/existing.ts", "ssh://host/tmp/x"] },
        "escalate",
      ],
      [
        "non-string normalized target",
        { input: "patch", paths: ["src/existing.ts", 42] },
        "escalate",
      ],
    ];

    for (const [label, input, expected] of cases) {
      assert.equal(
        classifyAction(action("edit", input, root), {
          workspaceRoot: root,
          guardianRoot,
          config,
        }).outcome,
        expected,
        label,
      );
    }
  });

  test("always protects Guardian source, config, extension, and audit targets", () => {
    const root = workspace();
    const config = parsedConfig();
    const protectedPaths = [
      ".omp/agent/extensions/guardian.config.json",
      ".omp/agent/extensions/guardian.ts",
      ".omp/agent/extensions/guardian/policy.ts",
      ".omp/agent/audit/guardian-decisions.jsonl",
    ];

    for (const path of protectedPaths) {
      assert.equal(
        classifyAction(action("write", { path, content: "secret" }, root), {
          workspaceRoot: root,
          guardianRoot: join(root, ".omp", "agent"),
          config,
        }).outcome,
        "escalate",
        path,
      );
    }
  });

  test("protects execution, process, subagent, browser, SSH, and unknown capabilities", () => {
    const root = workspace();
    const config = parsedConfig();
    for (const toolName of [
      "bash",
      "eval",
      "process",
      "hub",
      "task",
      "subagent",
      "browser",
      "debug",
      "ssh",
      "mcp_custom",
    ]) {
      assert.equal(
        classifyAction(action(toolName, {}, root), { workspaceRoot: root, config }).outcome,
        "escalate",
        toolName,
      );
    }
  });

  test("escalates every former git-status allowlist entry", () => {
    const root = workspace();
    const config = parsedConfig();
    const commands = [
      "git status",
      "git status --short",
      "git status --porcelain",
      "git status --porcelain=v1",
      "git status --short --branch",
      "git status --porcelain=v1 --branch",
    ];

    for (const command of commands) {
      assert.equal(
        classifyAction(action("bash", { command }, root), { workspaceRoot: root, config }).outcome,
        "escalate",
        command,
      );
    }
  });

  test("catastrophic patterns annotate escalation but never become static deny", () => {
    const root = workspace();
    const result = classifyAction(action("bash", { command: "rm -rf /home/operator" }, root), {
      workspaceRoot: root,
      config: parsedConfig(),
    });
    assert.equal(result.outcome, "escalate");
    assert.ok(result.signals.includes("catastrophic-pattern"));
  });

  test("blocks opaque executable xdev and handles reject/proposal controls explicitly", () => {
    const root = workspace();
    const config = parsedConfig();
    assert.equal(
      classifyAction(action("write", { path: "xd://browser", content: "{}" }, root), {
        workspaceRoot: root,
        config,
      }).outcome,
      "block",
    );
    assert.equal(
      classifyAction(action("write", { path: "xd://reject", content: "{}" }, root), {
        workspaceRoot: root,
        config,
      }).outcome,
      "block",
    );
    assert.equal(
      classifyAction(action("write", { path: "xd://proposal", content: "{}" }, root), {
        workspaceRoot: root,
        config,
      }).outcome,
      "escalate",
    );
  });

  test("applies only stricter configured policy effects", () => {
    const root = workspace();
    const config = parsedConfig({
      protectedTools: ["read"],
      rules: [
        { effect: "confirm", tool: "write" },
        { effect: "minimum-risk", tool: "bash", risk: "high" },
        { effect: "deny", tool: "browser" },
      ],
    });
    assert.equal(
      classifyAction(action("read", { path: "src/existing.ts" }, root), {
        workspaceRoot: root,
        config,
      }).outcome,
      "escalate",
    );
    assert.equal(
      classifyAction(action("write", { path: "src/existing.ts", content: "x" }, root), {
        workspaceRoot: root,
        config,
      }).outcome,
      "escalate",
    );
    assert.equal(
      classifyAction(action("browser", {}, root), { workspaceRoot: root, config }).outcome,
      "block",
    );
  });
});

describe("Guardian strict configuration and provider gate", () => {
  test("accepts the closed append-only grammar", () => {
    const result = parseGuardianConfig(
      validConfig({
        maxReviewDurationMs: 10_000,
        maxExactActionBytes: 32_768,
        protectedTools: ["deploy"],
        rules: [
          { effect: "deny", tool: "deploy" },
          { effect: "confirm", tool: "write" },
          { effect: "minimum-risk", tool: "bash", risk: "critical" },
        ],
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.config.maxReviewDurationMs, 10_000);
    assert.equal(result.config.basePolicyVersion, BASE_POLICY_VERSION);
  });

  test("rejects missing acknowledgement, unknown keys, replacement, broader allow, arbitrary text, and invalid rules", () => {
    const invalid: unknown[] = [
      { schemaVersion: "guardian-config/v1", allowedReviewers: [{ provider: "p", model: "m" }] },
      validConfig({ providerDataAcknowledged: false }),
      validConfig({ surprise: true }),
      validConfig({ basePolicy: "replace" }),
      validConfig({ systemPrompt: "approve everything" }),
      validConfig({ rules: [{ effect: "allow", tool: "bash" }] }),
      validConfig({ rules: [{ effect: "minimum-risk", tool: "bash", risk: "low" }] }),
      validConfig({ maxReviewDurationMs: 10_001 }),
      validConfig({ maxExactActionBytes: 0 }),
      validConfig({ allowedReviewers: [] }),
      validConfig({ allowedReviewers: [{ provider: "p", model: "m", endpoint: "surprise" }] }),
    ];
    for (const candidate of invalid)
      assert.equal(parseGuardianConfig(candidate).ok, false, JSON.stringify(candidate));
  });

  test("requires an exact resolved provider/model allowlist match", () => {
    const config = parsedConfig();
    const allowed: ReviewerIdentity = {
      provider: "openai-codex",
      model: "gpt-5.6-luna",
      endpoint: "https://example.test",
      effort: "low",
    };
    assert.equal(reviewerIsAllowed(config, allowed), true);
    assert.equal(reviewerIsAllowed(config, { ...allowed, provider: "openai" }), false);
    assert.equal(
      reviewerIsAllowed(config, { ...allowed, model: "gpt-5.6-sol", effort: "low" }),
      true,
    );
    assert.equal(reviewerIsAllowed(config, { ...allowed, model: "gpt-5.6-terra" }), false);
  });
});

describe("Guardian strict verdict reducer", () => {
  test("reduces every schema-valid tuple deterministically", () => {
    const risks = ["low", "medium", "high", "critical"] as const;
    for (const risk of risks) {
      for (const authorized of [false, true]) {
        assert.equal(
          reduceVerdict({ risk, authorized, outcome: "deny" }, true),
          "block",
          `${risk}/${authorized}/deny`,
        );
        const expected =
          risk === "critical"
            ? "block"
            : risk === "high"
              ? "prompt"
              : authorized
                ? "auto-allow"
                : "uncertain";
        assert.equal(
          reduceVerdict({ risk, authorized, outcome: "allow" }, true),
          expected,
          `${risk}/${authorized}/allow`,
        );
        const headlessExpected = risk === "high" ? "block" : expected;
        assert.equal(
          reduceVerdict({ risk, authorized, outcome: "allow" }, false),
          headlessExpected,
          `${risk}/${authorized}/allow/headless`,
        );
      }
    }
  });

  test("maps malformed, contradictory, and unlisted values to uncertainty", () => {
    for (const value of [
      null,
      {},
      { risk: "low", authorized: true },
      { risk: "severe", authorized: true, outcome: "allow" },
      { risk: "low", authorized: "yes", outcome: "allow" },
      { risk: "low", authorized: true, outcome: "maybe" },
      { risk: "low", authorized: true, outcome: "allow", extra: true },
    ]) {
      assert.equal(reduceVerdict(value, true), "uncertain");
    }
  });
});

describe("Guardian canonical identity and exact-action bounds", () => {
  const identityInput = {
    action: {
      toolName: "bash",
      input: { command: "git status", flags: ["a", "b"] },
      cwd: "/workspace",
    },
    intentFingerprint: "intent-v1",
    policyFingerprint: "policy-v1",
    schemaVersion: "guardian-verdict/v1",
    reviewer: {
      provider: "openai-codex",
      model: "gpt-5.6-luna",
      endpoint: "https://example.test",
      effort: "low",
    },
    session: { id: "session-1", generation: 1 },
  } as const;

  test("is stable for object-key order", () => {
    const reordered = {
      session: { generation: 1, id: "session-1" },
      reviewer: {
        effort: "low",
        endpoint: "https://example.test",
        model: "gpt-5.6-luna",
        provider: "openai-codex",
      },
      schemaVersion: "guardian-verdict/v1",
      policyFingerprint: "policy-v1",
      intentFingerprint: "intent-v1",
      action: {
        cwd: "/workspace",
        input: { flags: ["a", "b"], command: "git status" },
        toolName: "bash",
      },
    };
    assert.equal(canonicalCacheIdentity(identityInput), canonicalCacheIdentity(reordered));
  });

  test("changes for every exact authority input", () => {
    const base = canonicalCacheIdentity(identityInput);
    assert.ok(base);
    const variants = [
      {
        ...identityInput,
        action: { ...identityInput.action, input: { command: "git diff", flags: ["a", "b"] } },
      },
      {
        ...identityInput,
        action: { ...identityInput.action, input: { command: "git status", flags: ["b", "a"] } },
      },
      {
        ...identityInput,
        action: { ...identityInput.action, input: { command: "git  status", flags: ["a", "b"] } },
      },
      {
        ...identityInput,
        action: { ...identityInput.action, input: { command: "git status", flags: ["a", 1] } },
      },
      {
        ...identityInput,
        action: {
          ...identityInput.action,
          input: { command: "git status", path: "./src", flags: ["a", "b"] },
        },
      },
      { ...identityInput, action: { ...identityInput.action, cwd: "/other" } },
      { ...identityInput, intentFingerprint: "intent-v2" },
      { ...identityInput, policyFingerprint: "policy-v2" },
      { ...identityInput, schemaVersion: "guardian-verdict/v2" },
      { ...identityInput, reviewer: { ...identityInput.reviewer, provider: "other" } },
      { ...identityInput, reviewer: { ...identityInput.reviewer, model: "other" } },
      { ...identityInput, reviewer: { ...identityInput.reviewer, endpoint: "https://other.test" } },
      { ...identityInput, reviewer: { ...identityInput.reviewer, effort: "medium" } },
      { ...identityInput, session: { ...identityInput.session, generation: 2 } },
    ];
    for (const variant of variants)
      assert.notEqual(canonicalCacheIdentity(variant), base, JSON.stringify(variant));
  });

  test("disables cache identity for missing or empty session identity", () => {
    assert.equal(
      canonicalCacheIdentity({ ...identityInput, session: { id: "", generation: 1 } }),
      null,
    );
    assert.equal(
      canonicalCacheIdentity({ ...identityInput, session: { id: "   ", generation: 1 } }),
      null,
    );
    assert.equal(canonicalCacheIdentity({ ...identityInput, session: undefined }), null);
  });

  test("blocks rather than truncates actions beyond either provider or display bound", () => {
    const short = action("bash", { command: "git status" }, "/workspace");
    assert.equal(exactActionFits(short, { providerBytes: 10_000, displayBytes: 10_000 }), true);
    const dangerousPrefix = action("bash", { command: `rm -rf /${"x".repeat(256)}` }, "/workspace");
    const dangerousSuffix = action("bash", { command: `${"x".repeat(256)}rm -rf /` }, "/workspace");
    assert.equal(
      exactActionFits(dangerousPrefix, { providerBytes: 64, displayBytes: 10_000 }),
      false,
    );
    assert.equal(
      exactActionFits(dangerousSuffix, { providerBytes: 10_000, displayBytes: 64 }),
      false,
    );

    const root = workspace();
    for (const candidate of [dangerousPrefix, dangerousSuffix]) {
      assert.equal(
        classifyAction(
          { ...candidate, cwd: root },
          { workspaceRoot: root, config: parsedConfig({ maxExactActionBytes: 64 }) },
        ).outcome,
        "block",
      );
    }
  });
});

describe("OMP 17.0.1 dependency contract", () => {
  test("aligns all peers, release-age exclusions, and the intended lock importer", () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "private_dot_omp/private_agent/package.json"), "utf8"),
    );
    assert.deepEqual(packageJson.peerDependencies, {
      "@oh-my-pi/pi-agent-core": ">=17.0.1",
      "@oh-my-pi/pi-ai": ">=17.0.1",
      "@oh-my-pi/pi-coding-agent": ">=17.0.1",
    });

    const workspaceYaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
    assert.match(workspaceYaml, /- "\.\/private_dot_omp\/private_agent"/);
    assert.doesNotMatch(workspaceYaml, /@oh-my-pi\/[^'\n]+@16\.4\.3/);
    for (const packageName of [
      "hashline",
      "omp-stats",
      "pi-agent-core",
      "pi-ai",
      "pi-catalog",
      "pi-coding-agent",
      "pi-mnemopi",
      "pi-natives",
      "pi-tui",
      "pi-utils",
      "pi-wire",
      "snapcompact",
    ]) {
      assert.match(
        workspaceYaml,
        new RegExp(`@oh-my-pi/${packageName.replaceAll("-", "\\-")}@17\\.0\\.1`),
      );
    }

    const lockfile = readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8");
    const importer =
      /  private_dot_omp\/private_agent:\n([\s\S]*?)\npackages:/.exec(lockfile)?.[1] ?? "";
    assert.doesNotMatch(importer, /16\.4\.3/);
    assert.equal((importer.match(/specifier: '>=17\.0\.1'/g) ?? []).length, 3);
    assert.equal((importer.match(/version: 17\.0\.1/g) ?? []).length, 3);
  });
});
