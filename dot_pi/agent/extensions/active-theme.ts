import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function activeTheme(pi: ExtensionAPI) {
  pi.registerFlag("active-theme", {
    description: "Select a loaded theme for this invocation",
    type: "string",
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    const themeName = pi.getFlag("active-theme") as string | undefined;
    if (!themeName) return;

    const result = ctx.ui.setTheme(themeName);
    if (!result.success) {
      ctx.ui.notify(`Could not activate theme '${themeName}': ${result.error}`, "error");
    }
  });
}
