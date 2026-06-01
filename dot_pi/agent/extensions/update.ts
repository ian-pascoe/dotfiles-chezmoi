import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const TRANSIENT_PATTERNS = [
  /eai_again/i,
  /etimedout/i,
  /econnreset/i,
  /econnrefused/i,
  /socket hang up/i,
  /network/i,
  /timeout/i,
  /temporar/i,
  /too many requests/i,
  /\b429\b/,
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
];

async function currentVersion(pi: ExtensionAPI) {
  const result = await pi.exec("pi", ["--version"], { timeout: 10_000 });
  return result.stdout.trim() || result.stderr.trim() || "unknown";
}

function isTransient(output: string) {
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(output));
}

async function runWithRetry(pi: ExtensionAPI) {
  let lastOutput = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await pi.exec("pi", ["update"], { timeout: 180_000 });
    lastOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    if (result.code === 0) return { ok: true, output: lastOutput, attempts: attempt };
    if (attempt === 3 || !isTransient(lastOutput))
      return { ok: false, output: lastOutput, attempts: attempt };
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  return { ok: false, output: lastOutput, attempts: 3 };
}

async function updatePi(pi: ExtensionAPI, ctx: ExtensionCommandContext) {
  await ctx.waitForIdle();

  const before = await currentVersion(pi).catch(() => "unknown");

  ctx.ui.notify("Updating Pi...");
  const result = await runWithRetry(pi);
  const after = await currentVersion(pi).catch(() => "unknown");

  if (!result.ok) {
    ctx.ui.notify(
      `Pi update failed after ${result.attempts} attempt(s). ${result.output || "No output."}`,
      "error",
    );
    return;
  }

  const changed = before !== after && before !== "unknown" && after !== "unknown";
  const summary = changed ? `Pi updated: ${before} → ${after}` : `Pi is up to date (${after}).`;
  ctx.ui.notify(
    `${summary}${result.attempts > 1 ? ` Retried ${result.attempts - 1} transient failure(s).` : ""}`,
    "info",
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("update", {
    description: "Update Pi using the detected install method, then report the version change",
    type: "boolean",
    default: false,
  });

  pi.registerCommand("update", {
    description: "Update Pi using vp, bun, npm, brew, or native detection",
    handler: async (_args, ctx) => {
      await updatePi(pi, ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!pi.getFlag("update")) return;
    pi.sendUserMessage("/update", { deliverAs: "followUp" });
    ctx.ui.notify("Queued /update from --update", "info");
  });
}
