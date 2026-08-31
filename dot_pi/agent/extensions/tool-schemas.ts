import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function toolSchemas(pi: ExtensionAPI) {
  pi.registerCommand("tools", {
    description: "List active tools and their parameter schemas",
    handler: async (_args, ctx) => {
      const activeToolNames = new Set(pi.getActiveTools());
      const activeTools = pi.getAllTools().filter((tool) => activeToolNames.has(tool.name));
      if (activeTools.length === 0) {
        ctx.ui.notify("No active tools.", "info");
        return;
      }

      const selectedName = await ctx.ui.select(
        `Active tools (${activeTools.length}) — select to view schema`,
        activeTools.map((tool) => tool.name),
      );
      const selectedTool = activeTools.find((tool) => tool.name === selectedName);
      if (selectedTool) {
        await ctx.ui.editor(
          `${selectedTool.name} schema`,
          `Description\n${selectedTool.description}\n\nSchema\n${JSON.stringify(selectedTool.parameters, null, 2)}`,
        );
      }
    },
  });
}
