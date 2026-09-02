import assert from "node:assert/strict";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { test } from "vitest";
import commandDeckEditor from "./command-deck-editor.js";

type EventHandler = (event: unknown, context: ExtensionContext) => unknown;

test("the command deck renders concise editor status and an empty prompt", async () => {
  const handlers = new Map<string, EventHandler>();
  let editorFactory:
    | NonNullable<Parameters<ExtensionUIContext["setEditorComponent"]>[0]>
    | undefined;
  let workingVisible = true;
  let footerWasReplaced = false;
  let footerComponent: Component | undefined;
  const usedColors: string[] = [];

  const tui = {
    terminal: { rows: 40 },
    requestRender() {},
    // SAFETY: The editor render path only reads terminal rows and requests redraws.
  } as unknown as TUI;
  const theme = {
    fg(color: string, text: string) {
      usedColors.push(color);
      return text;
    },
    getThinkingBorderColor() {
      return (text: string) => {
        usedColors.push("thinkingHigh");
        return text;
      };
    },
    // SAFETY: The command deck only uses the two theme methods implemented above.
  } as unknown as Theme;
  const editorTheme = {
    borderColor: (text: string) => text,
    selectList: {},
    // SAFETY: Rendering an editor with no autocomplete does not read the select-list theme.
  } as EditorTheme;

  const ui = {
    theme,
    setWorkingVisible(visible: boolean) {
      workingVisible = visible;
    },
    setFooter(factory: Parameters<ExtensionUIContext["setFooter"]>[0]) {
      footerWasReplaced = true;
      footerComponent = factory?.(tui, theme, {
        getGitBranch: () => "main",
        getExtensionStatuses: () =>
          new Map([
            ["codemode-observer", "◉ 1 running · 1 live"],
            ["minimal-subagents", "◉ 2 running · 3 retained"],
            ["pi-mcp", "MCP 1/1"],
            ["tps", "12.3 tok/s"],
          ]),
        getAvailableProviderCount: () => 1,
        onBranchChange: () => () => {},
      });
    },
    setEditorComponent(factory: Parameters<ExtensionUIContext["setEditorComponent"]>[0]) {
      editorFactory = factory;
    },
    // SAFETY: The extension only calls the three UI methods implemented by this recording context.
  } as unknown as ExtensionUIContext;
  const context = {
    ui,
    mode: "tui",
    cwd: `${process.env.HOME}/project`,
    model: { id: "gpt-test", contextWindow: 200_000 },
    sessionManager: {
      getEntries: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            usage: { input: 20, output: 10, cacheRead: 70, cacheWrite: 10 },
          },
        },
      ],
    },
    getContextUsage: () => ({ tokens: 76_000, contextWindow: 200_000, percent: 38 }),
    // SAFETY: The registered handlers only read the context fields implemented above.
  } as unknown as ExtensionContext;
  const pi = {
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
    getThinkingLevel: () => "high",
    exec: async () => ({
      stdout: [
        "# branch.oid abc123",
        "# branch.head main",
        "# branch.ab +2 -1",
        "1 .M N... 100644 100644 100644 abc123 abc123 tracked.ts",
        "? untracked.ts",
      ].join("\n"),
      stderr: "",
      code: 0,
      killed: false,
    }),
    // SAFETY: The extension only calls on(), getThinkingLevel(), and exec() in this test.
  } as unknown as ExtensionAPI;

  commandDeckEditor(pi);
  await handlers.get("session_start")?.({ type: "session_start" }, context);

  assert.equal(workingVisible, true);
  assert.equal(footerWasReplaced, true);
  assert.ok(editorFactory);

  // SAFETY: Rendering does not consult keybindings until input is handled.
  const editor = editorFactory(tui, editorTheme, {} as KeybindingsManager);
  const idleLines = editor.render(120);
  assert.ok(idleLines.every((line) => visibleWidth(line) === 120));
  assert.match(idleLines[0] ?? "", /● ready/);
  assert.match(idleLines[0] ?? "", /gpt-test · high/);
  assert.equal(idleLines[1], " ".repeat(120));
  assert.match(idleLines[2] ?? "", /Type your prompt…/);
  assert.equal(idleLines[3], " ".repeat(120));
  assert.match(idleLines.at(-1) ?? "", /project · main · ⇡2 · ⇣1 · \?1 · 1/);
  assert.match(idleLines.at(-1) ?? "", /cache 70\.0% · ctx 38%/);
  assert.doesNotMatch(idleLines.at(-1) ?? "", /MCP|tok\/s|running/);
  assert.ok(footerComponent);
  assert.deepEqual(footerComponent.render(120), [
    "◉ 1 running · 1 live · ◉ 2 running · 3 retained · MCP 1/1 · 12.3 tok/s",
  ]);
  assert.ok(usedColors.includes("success"));
  assert.ok(usedColors.includes("syntaxFunction"));
  assert.ok(usedColors.includes("thinkingHigh"));
  assert.ok(editor.render(4).every((line) => visibleWidth(line) === 4));

  handlers.get("agent_start")?.({ type: "agent_start" }, context);
  assert.match(editor.render(80)[0] ?? "", /working/);
  handlers.get("agent_settled")?.({ type: "agent_settled" }, context);
});
