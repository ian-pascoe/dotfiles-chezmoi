import { createHmac, randomBytes } from "node:crypto";

import { canonicalActionFingerprint, type ReviewerIdentity, type ToolAction } from "./policy";
import type { GuardianVerdict } from "./reviewer";

const MAX_CACHE_ENTRIES = 128;
const MAX_USER_INTENT_CHARS = 1_000;
const MAX_ASSISTANT_INTENT_CHARS = 1_000;

export type CachedAssessment = {
  verdict: GuardianVerdict;
  reviewer: ReviewerIdentity;
};

export type DecisionAttempt = {
  id: string;
  generation: number;
  action: ToolAction;
  actionFingerprint: string;
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

export class GuardianSessionRuntime {
  #sessionId = "";
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
    return this.#sessionId.length > 0;
  }

  reset(sessionId: string): boolean {
    this.#invalidateActive("Guardian session changed");
    this.#generation += 1;
    this.#sessionId = sessionId.trim();
    this.#auditKey = randomBytes(32);
    this.#cache.clear();
    this.#userIntent = "";
    this.#assistantIntent = "";
    return this.ready;
  }

  dispose(): void {
    this.#invalidateActive("Guardian session disposed");
    this.#generation += 1;
    this.#sessionId = "";
    this.#auditKey.fill(0);
    this.#cache.clear();
    this.#userIntent = "";
    this.#assistantIntent = "";
  }

  startTurn(userIntent: string): void {
    this.#userIntent = boundedText(userIntent, MAX_USER_INTENT_CHARS);
    this.#assistantIntent = "";
  }

  updateAssistantIntent(assistantIntent: string): void {
    this.#assistantIntent = boundedText(assistantIntent, MAX_ASSISTANT_INTENT_CHARS);
  }

  intentEvidence(): string {
    return JSON.stringify({ user: this.#userIntent, assistant: this.#assistantIntent });
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
    const assessment = this.#cache.get(key);
    if (!assessment) return undefined;
    this.#cache.delete(key);
    this.#cache.set(key, assessment);
    return assessment;
  }

  cache(key: string, assessment: CachedAssessment): void {
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
