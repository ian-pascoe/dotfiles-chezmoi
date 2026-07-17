import { createHmac, randomBytes } from "node:crypto";

import { canonicalActionFingerprint, type ReviewerIdentity, type ToolAction } from "./policy";
import type { GuardianVerdict } from "./reviewer";

const MAX_CACHE_ENTRIES = 128;
const MAX_INTENT_ENVELOPE_CHARS = 2_000;
const MAX_INTENT_FIELD_CHARS = MAX_INTENT_ENVELOPE_CHARS;

export type CachedAssessment = {
  verdict: GuardianVerdict;
  reviewer: ReviewerIdentity;
};

export type DecisionAttempt = {
  id: string;
  generation: number;
  action: ToolAction;
  actionFingerprint: string;
  reviewSessionId: string;
  startedAt: number;
  controller: AbortController;
  terminal: boolean;
  detachParentAbort?: () => void;
};

function boundedText(value: string, limit: number): string {
  return Array.from(
    value
      .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(-limit)
    .join("");
}

function tailWithinJsonBudget(value: string, budget: number): { value: string; cost: number } {
  const points = Array.from(value);
  let cost = 0;
  let start = points.length;
  while (start > 0) {
    const pointCost = JSON.stringify(points[start - 1]!).length - 2;
    if (cost + pointCost > budget) break;
    cost += pointCost;
    start -= 1;
  }
  return { value: points.slice(start).join(""), cost };
}

function serializeIntentEnvelope(user: string, assistant: string): string {
  const emptyEnvelope = JSON.stringify({ user: "", assistant: "" });
  const payloadBudget = MAX_INTENT_ENVELOPE_CHARS - emptyEnvelope.length;
  let userTail = tailWithinJsonBudget(user, Math.floor(payloadBudget / 2));
  const assistantTail = tailWithinJsonBudget(assistant, payloadBudget - userTail.cost);
  if (assistantTail.cost < payloadBudget - userTail.cost)
    userTail = tailWithinJsonBudget(user, payloadBudget - assistantTail.cost);
  return JSON.stringify({ user: userTail.value, assistant: assistantTail.value });
}

export class GuardianSessionRuntime {
  #sessionId = "";
  #active = false;
  #generation = 0;
  #auditKey = randomBytes(32);
  #cache = new Map<string, CachedAssessment>();
  #attempts = new Map<string, DecisionAttempt>();
  #userIntent = "";
  #assistantIntent = "";

  get sessionId(): string {
    return this.#sessionId;
  }

  get generation(): number {
    return this.#generation;
  }

  get ready(): boolean {
    return this.#active;
  }

  get cacheEligible(): boolean {
    return this.#active && this.#sessionId.length > 0;
  }

  reset(sessionId: string): boolean {
    this.#invalidateActive("Guardian session changed");
    this.#generation += 1;
    this.#sessionId = sessionId.trim();
    this.#active = true;
    this.#auditKey = randomBytes(32);
    this.#cache.clear();
    this.#userIntent = "";
    this.#assistantIntent = "";
    return this.ready;
  }

  abortActive(reason = "Guardian session transition started"): void {
    this.#invalidateActive(reason);
  }

  dispose(): void {
    this.#invalidateActive("Guardian session disposed");
    this.#generation += 1;
    this.#sessionId = "";
    this.#active = false;
    this.#auditKey.fill(0);
    this.#cache.clear();
    this.#userIntent = "";
    this.#assistantIntent = "";
  }

  startTurn(userIntent: string): void {
    this.#userIntent = boundedText(userIntent, MAX_INTENT_FIELD_CHARS);
    this.#assistantIntent = "";
  }

  updateAssistantIntent(assistantIntent: string): void {
    this.#assistantIntent = boundedText(assistantIntent, MAX_INTENT_FIELD_CHARS);
  }

  intentEvidence(): string {
    return serializeIntentEnvelope(this.#userIntent, this.#assistantIntent);
  }

  beginAttempt(id: string, action: ToolAction, parentSignal?: AbortSignal): DecisionAttempt | null {
    if (!this.ready || id.trim().length === 0 || this.#attempts.has(id)) return null;
    const startedAt = Date.now();
    let snapshot: ToolAction;
    try {
      snapshot = {
        toolName: action.toolName,
        input: structuredClone(action.input),
        cwd: action.cwd,
      };
    } catch {
      return null;
    }
    const actionFingerprint = canonicalActionFingerprint(snapshot);
    if (actionFingerprint === null) return null;
    const reviewSessionId =
      this.#sessionId.length > 0
        ? this.#sessionId
        : `guardian-ephemeral-${randomBytes(16).toString("hex")}`;

    const controller = new AbortController();
    let detachParentAbort: (() => void) | undefined;
    if (parentSignal) {
      const abortFromParent = () => controller.abort(parentSignal.reason);
      if (parentSignal.aborted) abortFromParent();
      else {
        parentSignal.addEventListener("abort", abortFromParent, { once: true });
        detachParentAbort = () => parentSignal.removeEventListener("abort", abortFromParent);
      }
    }
    const attempt: DecisionAttempt = {
      id,
      generation: this.#generation,
      action: snapshot,
      actionFingerprint,
      reviewSessionId,
      startedAt,
      controller,
      terminal: false,
      detachParentAbort,
    };
    this.#attempts.set(id, attempt);
    return attempt;
  }

  isCurrent(attempt: DecisionAttempt, liveAction: ToolAction): boolean {
    return (
      this.ready &&
      !attempt.terminal &&
      attempt.generation === this.#generation &&
      this.#attempts.get(attempt.id) === attempt &&
      canonicalActionFingerprint(liveAction) === attempt.actionFingerprint &&
      !attempt.controller.signal.aborted
    );
  }

  claimTerminal(attempt: DecisionAttempt, liveAction: ToolAction): boolean {
    if (!this.isCurrent(attempt, liveAction)) return false;
    attempt.terminal = true;
    attempt.detachParentAbort?.();
    this.#attempts.delete(attempt.id);
    return true;
  }

  abandon(attempt: DecisionAttempt, reason = "Guardian attempt abandoned"): void {
    if (this.#attempts.get(attempt.id) !== attempt) return;
    attempt.terminal = true;
    attempt.detachParentAbort?.();
    attempt.controller.abort(new Error(reason));
    this.#attempts.delete(attempt.id);
  }

  cached(key: string): CachedAssessment | undefined {
    if (!this.cacheEligible) return undefined;
    const assessment = this.#cache.get(key);
    if (!assessment) return undefined;
    this.#cache.delete(key);
    this.#cache.set(key, assessment);
    return assessment;
  }

  cache(key: string, assessment: CachedAssessment): void {
    if (!this.cacheEligible) return;
    this.#cache.delete(key);
    this.#cache.set(key, assessment);
    while (this.#cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }
  }

  auditTag(value: string): string {
    return createHmac("sha256", this.#auditKey).update(value).digest("hex");
  }

  #invalidateActive(reason: string): void {
    for (const attempt of this.#attempts.values()) {
      attempt.terminal = true;
      attempt.detachParentAbort?.();
      attempt.controller.abort(new Error(reason));
    }
    this.#attempts.clear();
  }
}
