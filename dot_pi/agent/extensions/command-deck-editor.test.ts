import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionUIContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
// Pi exports this manager as a type only; use its real implementation in routing tests.
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { test } from "vitest";
import commandDeckEditor from "./command-deck-editor.js";

type EventHandler = (event: unknown, context: ExtensionContext) => unknown;

async function createDeck() {
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
    borderColor: (text: string) => `\x1b[36m${text}\x1b[0m`,
    selectList: {
      selectedPrefix: (text: string) => text,
      selectedText: (text: string) => text,
      description: (text: string) => text,
      scrollInfo: (text: string) => text,
      noMatch: (text: string) => text,
    },
  } satisfies EditorTheme;

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

  const editor = editorFactory(
    tui,
    editorTheme,
    new KeybindingsManager({
      "app.interrupt": "ctrl+\\",
    }),
  );
  assert.ok(editor instanceof CustomEditor);
  return { editor, usedColors, footerComponent };
}

function keys(editor: CustomEditor, ...inputs: string[]) {
  for (const input of inputs) editor.handleInput(input);
}

function expectMode(editor: CustomEditor, mode: string) {
  assert.match(editor.render(120).at(-1) ?? "", new RegExp(` ${mode} `));
}

const ESC = "\x1b";

test("Vim navigation aliases retain native keys and keep typing available", () => {
  const config = JSON.parse(readFileSync(new URL("../keybindings.json", import.meta.url), "utf8"));
  const bindings = new KeybindingsManager(config);
  assert.deepEqual(bindings.getKeys("app.interrupt"), ["ctrl+\\"]);
  assert.equal(bindings.matches("\x1c", "app.interrupt"), true);
  assert.equal(bindings.matches("\x1b[92;5u", "app.interrupt"), true);
  assert.equal(bindings.matches(ESC, "app.interrupt"), false);
  assert.deepEqual(bindings.getKeys("tui.select.down"), ["down", "ctrl+j"]);
  assert.deepEqual(bindings.getKeys("tui.select.up"), ["up", "ctrl+k"]);
  assert.equal(bindings.matches("j", "tui.select.down"), false);
  assert.equal(bindings.matches("k", "tui.select.up"), false);
  assert.equal(bindings.matches("\x1bj", "tui.altScreen.lineDown"), true);
  assert.equal(bindings.matches("\x1bk", "tui.altScreen.lineUp"), true);
  assert.equal(bindings.matches("\x1b/", "tui.altScreen.search"), true);
  assert.equal(bindings.matches("\x07", "app.editor.external"), true);
});

test("the command deck renders concise editor status and an empty prompt", async () => {
  const { editor, usedColors, footerComponent } = await createDeck();
  const idleLines = editor.render(120);
  assert.ok(idleLines.every((line) => visibleWidth(line) === 120));
  assert.match(idleLines[0] ?? "", /gpt-test · high/);
  assert.match(idleLines[0] ?? "", /project · main · ⇡2 · ⇣1 · \?1 · 1/);
  assert.doesNotMatch(idleLines[0] ?? "", /INSERT/);
  assert.doesNotMatch(idleLines[0] ?? "", /ready|working/);
  assert.match(idleLines[1] ?? "", /Type your prompt…/);
  assert.match(idleLines.at(-1) ?? "", /INSERT/);
  assert.doesNotMatch(idleLines.at(-1) ?? "", /project · main/);
  assert.match(idleLines.at(-1) ?? "", /cache 70\.0% · ctx 38%/);
  assert.doesNotMatch(idleLines.at(-1) ?? "", /MCP|tok\/s|running/);
  assert.ok(footerComponent);
  assert.deepEqual(footerComponent.render(120), [
    "◉ 1 running · 1 live · ◉ 2 running · 3 retained · MCP 1/1 · 12.3 tok/s",
  ]);
  assert.ok(usedColors.includes("syntaxFunction"));
  assert.ok(usedColors.includes("thinkingHigh"));
  assert.ok(editor.render(4).every((line) => visibleWidth(line) === 4));

  editor.setAutocompleteProvider({
    async getSuggestions() {
      return { prefix: "/", items: [{ value: "/unique", label: "/unique" }] };
    },
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
  });
  editor.handleInput("/");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const completionLines = editor.render(120);
  assert.equal(completionLines.length, 4);
  assert.match(completionLines[0] ?? "", /project · main/);
  assert.match(completionLines[2] ?? "", /INSERT/);
  assert.match(completionLines[3] ?? "", /\/unique/);
});

test("Vim motions, changes, visual selections and undo edit the prompt", async () => {
  const { editor } = await createDeck();
  editor.setText("one two\nthree");
  keys(editor, ESC, "g", "g", "0", "w");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 4 });
  keys(editor, "c", "i", "w");
  expectMode(editor, "INSERT");
  keys(editor, "new", ESC);
  assert.equal(editor.getText(), "one new\nthree");
  keys(editor, "u");
  assert.equal(editor.getText(), "one two\nthree");
  keys(editor, "0", "v", "l", "l");
  expectMode(editor, "VISUAL");
  keys(editor, "d");
  assert.equal(editor.getText(), " two\nthree");
  keys(editor, "u", "d", "d");
  assert.equal(editor.getText(), "three");
  keys(editor, "p");
  assert.equal(editor.getText(), "three\none two");
});

test("one Escape leaves Visual mode even with an unfinished count or motion", async () => {
  const { editor } = await createDeck();
  for (const visual of ["v", "V"]) {
    for (const prefix of ["2", "f", "g"]) {
      editor.setText("hello");
      keys(editor, ESC, visual, prefix, ESC);
      expectMode(editor, "NORMAL");
      assert.equal(editor.getText(), "hello");
    }
  }
});

test("pending Vim commands remain visible in the command deck", async () => {
  const { editor } = await createDeck();
  editor.setText("hello");
  keys(editor, ESC, "d");
  assert.match(editor.render(120).at(-1) ?? "", /NORMAL d_/);
  keys(editor, ESC, ":", "q");
  assert.match(editor.render(120).at(-1) ?? "", /EX :q_/);
  keys(editor, ESC);
  expectMode(editor, "NORMAL");
});

test("Pi interrupt and external-editor shortcuts survive Vim prefixes and autocomplete", async () => {
  const { editor } = await createDeck();
  let interrupted = 0;
  let external = 0;
  editor.onEscape = () => {
    interrupted++;
  };
  editor.onAction("app.editor.external", () => {
    external++;
  });
  for (const prefix of [[], ["r"], ["g"], ["d"], ["c", "i"], ["v"], [":"]]) {
    editor.setText("hello");
    keys(editor, ESC, ...prefix, "\x1c");
    assert.equal(interrupted, 1, `interrupt after ${prefix.join("")}`);
    interrupted = 0;
    editor.setText("hello");
    keys(editor, ESC, ...prefix, "\x07");
    assert.equal(external, 1, `external editor after ${prefix.join("")}`);
    external = 0;
    assert.equal(editor.getText(), "hello");
  }
  editor.setText("");
  editor.setAutocompleteProvider({
    async getSuggestions() {
      return { prefix: "/", items: [{ value: "/unique", label: "/unique" }] };
    },
    applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
  });
  keys(editor, "/");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.isShowingAutocomplete(), true);
  keys(editor, "\x1c");
  assert.equal(interrupted, 1);
  keys(editor, ESC, ESC);
  assert.equal(interrupted, 1, "Escape changes mode, never interrupts");
});

test("submitted and externally replaced prompts return to Insert mode", async () => {
  const { editor } = await createDeck();
  const submitted: string[] = [];
  editor.onSubmit = (text) => submitted.push(text);
  editor.setText("hello");
  keys(editor, ESC, "\r");
  assert.deepEqual(submitted, ["hello"]);
  expectMode(editor, "INSERT");
  keys(editor, "next");
  assert.equal(editor.getText(), "next");
  keys(editor, ESC, "v", "2");
  editor.setText("restored");
  expectMode(editor, "INSERT");
  keys(editor, "!");
  assert.equal(editor.getText(), "restored!");
});
