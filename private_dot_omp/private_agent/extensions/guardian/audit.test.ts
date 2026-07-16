import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  encodeForTrustedTerminal,
  persistGuardianAudit,
  type GuardianAuditInput,
  type GuardianAuditRecord,
} from "./audit";

const SECRET = "sk-live-super-secret-token";

function auditInput(overrides: Partial<GuardianAuditInput> = {}): GuardianAuditInput {
  return {
    sessionId: `session-${SECRET}`,
    generation: 3,
    actionFingerprint: `action-${SECRET}`,
    toolName: `malicious-${SECRET}`,
    disposition: "model_allow" as const,
    reason: "safe_rule" as const,
    risk: "medium" as const,
    reviewer: {
      provider: `provider-${SECRET}`,
      model: `model-${SECRET}`,
      endpoint: `https://example.invalid/${SECRET}`,
      effort: "low",
    },
    latencyMs: 12.4,
    ...overrides,
  };
}

describe("Guardian audit leaf", () => {
  test("persists the same redacted record to session and operational sinks", () => {
    const session: GuardianAuditRecord[] = [];
    const operational: GuardianAuditRecord[] = [];
    const result = persistGuardianAudit(auditInput(), (value) => `hmac:${value.length}`, {
      appendSession: (record) => session.push(record),
      appendOperational: (record) => operational.push(record),
    });

    assert.equal(result.ok, true);
    assert.equal(session.length, 1);
    assert.deepEqual(operational, session);
    assert.equal(session[0]?.tool, "other");
    assert.match(session[0]?.sessionTag ?? "", /^hmac:/);
    assert.match(session[0]?.actionTag ?? "", /^hmac:/);
    assert.match(session[0]?.reviewerTag ?? "", /^hmac:/);
    assert.equal(session[0]?.source, "model");
    assert.equal(session[0]?.outcome, "allow");
    assert.equal(session[0]?.cacheStatus, "miss");
    assert.equal(session[0]?.latencyMs, 12);
  });

  test("derives decision source, outcome, and cache status from terminal disposition", () => {
    const cases = [
      ["static_bypass", "static", "allow", "not-applicable"],
      ["cached_block", "cache", "block", "hit"],
      ["prompt_deny", "operator", "block", "miss"],
      ["review_failure", "failure", "block", "miss"],
    ] as const;

    for (const [disposition, source, outcome, cacheStatus] of cases) {
      let record: GuardianAuditRecord | undefined;
      const result = persistGuardianAudit(auditInput({ disposition }), () => "digest", {
        appendSession: (value) => {
          record = value;
        },
        appendOperational: () => undefined,
      });
      assert.equal(result.ok, true);
      assert.equal(record?.source, source);
      assert.equal(record?.outcome, outcome);
      assert.equal(record?.cacheStatus, cacheStatus);
    }
  });

  test("never persists raw inputs, fragments, encodings, or provider rationale", () => {
    const records: GuardianAuditRecord[] = [];
    const result = persistGuardianAudit(auditInput(), () => "fixed-digest", {
      appendSession: (record) => records.push(record),
      appendOperational: () => undefined,
    });

    assert.equal(result.ok, true);
    const serialized = JSON.stringify(records);
    for (const leak of [
      SECRET,
      SECRET.slice(0, 8),
      Buffer.from(SECRET).toString("base64"),
      encodeURIComponent(SECRET),
    ]) {
      assert.doesNotMatch(serialized, new RegExp(leak.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(serialized, /provider-|model-|example\.invalid|malicious-/);
  });

  test("reports synchronous failure from either required sink", () => {
    const sessionFailure = persistGuardianAudit(auditInput(), () => "digest", {
      appendSession: () => {
        throw new Error(SECRET);
      },
      appendOperational: () => assert.fail("operational sink must not run after session failure"),
    });
    const operationalFailure = persistGuardianAudit(auditInput(), () => "digest", {
      appendSession: () => undefined,
      appendOperational: () => {
        throw new Error(SECRET);
      },
    });

    assert.deepEqual(sessionFailure, { ok: false, reason: "audit_failure" });
    assert.deepEqual(operationalFailure, { ok: false, reason: "audit_failure" });
  });
});

describe("trusted terminal encoding", () => {
  test("renders controls, bidi, and non-ASCII confusables as visible escapes", () => {
    const encoded = encodeForTrustedTerminal({
      command: "safe\u001b[2J\u202e⁄bin／rm\u0000",
      rationale: "line\nnext",
    });

    for (const unsafe of ["\u001b", "\u202e", "⁄", "／", "\u0000"])
      assert.equal(encoded.includes(unsafe), false);
    assert.match(encoded, /\\u001b/);
    assert.match(encoded, /\\u202e/);
    assert.match(encoded, /\\u2044/);
    assert.match(encoded, /\\uff0f/);
    assert.match(encoded, /\\u0000/);
  });
});
