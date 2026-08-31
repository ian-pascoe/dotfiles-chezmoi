import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import toolSchemas from "./tool-schemas.js";

type CommandHandler = Parameters<ExtensionAPI["registerCommand"]>[1]["handler"];

test("/tools lists active tools and opens the selected schema", async () => {
  let handler: CommandHandler | undefined;
  const tools = [
    {
      name: "read",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
    },
    { name: "write", description: "Write a file", parameters: { type: "object" } },
  ] as unknown as ReturnType<ExtensionAPI["getAllTools"]>;
  const recordingPi = {
    registerCommand(name: string, command: { handler: CommandHandler }) {
      assert.equal(name, "tools");
      handler = command.handler;
    },
    getActiveTools: () => ["read"],
    getAllTools: () => tools,
  } as unknown as ExtensionAPI;
  let dialog: [string, string | undefined] | undefined;
  const context = {
    ui: {
      select: async (title: string, items: string[]) => {
        assert.equal(title, "Active tools (1) — select to view schema");
        assert.deepEqual(items, ["read"]);
        return "read";
      },
      editor: async (title: string, prefill?: string) => {
        dialog = [title, prefill];
        return undefined;
      },
    },
  } as unknown as ExtensionCommandContext;

  toolSchemas(recordingPi);
  assert.ok(handler);
  await handler("", context);

  assert.deepEqual(dialog, [
    "read schema",
    'Description\nRead a file\n\nSchema\n{\n  "type": "object",\n  "properties": {\n    "path": {\n      "type": "string"\n    }\n  }\n}',
  ]);
});
