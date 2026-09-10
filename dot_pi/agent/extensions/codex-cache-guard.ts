import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ENTRY = "codex-cache-guard";
const NOTICE =
  "Codex cache guard paused this session after repeated large cache misses. " +
  "No automatic retry will be sent. Start /new, or use /codex-cache-resume " +
  "to explicitly accept the risk and retry (then /rollover to reduce context).";

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Hash arbitrary provider JSON without interpreting or persisting its contents.
function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "null")
    .digest("hex");
}

/** Emergency local mitigation, not a claim that provider caching can be guaranteed. */
export default function codexCacheGuard(pi: ExtensionAPI): void {
  let previous: { model: string; tokens: number } | undefined;
  let misses = 0;
  let blocked = false;
  let request: { settings: string; items: string[] } | undefined;
  let comparison:
    | { settingsUnchanged: boolean; commonItems: number; previousItems: number }
    | undefined;

  const clearMeasurements = () => {
    previous = undefined;
    misses = 0;
    request = undefined;
    comparison = undefined;
  };
  const restore = (ctx: ExtensionContext) => {
    clearMeasurements();
    blocked = false;
    for (const entry of ctx.sessionManager.getBranch().slice().reverse()) {
      if (entry.type === "compaction") break;
      if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Persisted custom-entry boundary; only a boolean latch is consumed.
      if (entry.data && typeof entry.data === "object" && "blocked" in entry.data) {
        blocked = entry.data.blocked === true;
        break;
      }
    }
    if (blocked) ctx.ui.notify(NOTICE, "warning");
  };
  const reset = () => {
    blocked = false;
    clearMeasurements();
    pi.appendEntry(ENTRY, { blocked: false });
  };
  const stopIfBlocked = (ctx: ExtensionContext) => {
    if (blocked && ctx.model?.provider === "openai-codex") {
      ctx.abort();
      return true;
    }
    return false;
  };

  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("session_compact", reset);
  pi.on("model_select", clearMeasurements);
  pi.on("context", (_event, ctx) => {
    // Extension exceptions are swallowed by Pi; abort the run's signal instead.
    stopIfBlocked(ctx);
  });
  pi.on("before_provider_request", (event, ctx) => {
    if (stopIfBlocked(ctx) || ctx.model?.provider !== "openai-codex") return;
    const payload = event.payload;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Provider-owned payload boundary; unknown formats are ignored, never rewritten.
    if (!payload || typeof payload !== "object" || !("input" in payload)) return;
    const { input, ...settings } = payload;
    if (!Array.isArray(input)) return;
    const next = { settings: hash(settings), items: input.map(hash) };
    comparison = undefined;
    if (request) {
      let commonItems = 0;
      while (
        commonItems < request.items.length &&
        next.items[commonItems] === request.items[commonItems]
      )
        commonItems++;
      comparison = {
        settingsUnchanged: request.settings === next.settings,
        commonItems,
        previousItems: request.items.length,
      };
    }
    request = next;
  });
  pi.on("turn_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant" || message.provider !== "openai-codex") {
      clearMeasurements();
      return;
    }
    const { input, cacheRead, cacheWrite } = message.usage;
    const tokens = input + cacheRead + cacheWrite;
    if (tokens <= 0 || message.stopReason === "error" || message.stopReason === "aborted") return;
    const reusable =
      previous && previous.model === message.model ? Math.min(previous.tokens, tokens) : 0;
    const lost = Math.max(0, reusable - cacheRead);
    // Ignore cold starts, small misses, model switches, and newly added tool output.
    misses = lost >= 32_768 && cacheRead < reusable / 2 ? misses + 1 : 0;
    previous = { model: message.model, tokens };
    blocked ||= misses >= 2;
    // No prompts, tool arguments/results, headers, credentials, or raw cache keys are logged.
    pi.appendEntry(ENTRY, {
      blocked,
      input,
      cacheRead,
      lost,
      consecutiveMisses: misses,
      request: request?.settings,
      comparison,
    });
    if (blocked) {
      // turn_end runs after the tool batch; let writes finish, then prevent the next model call.
      ctx.abort();
      ctx.ui.notify(NOTICE, "warning");
    }
  });
  pi.registerCommand("codex-cache-resume", {
    description: "Reset the Codex cache circuit breaker and permit another attempt",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      reset();
      ctx.ui.notify("Codex cache guard reset. Send your next prompt to retry.", "info");
    },
  });
}
