import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const EMPTY_PROMPT = " Type your prompt…";
const CURSOR = "\x1b[7m \x1b[0m";

function renderCommandDeckBorder(
  left: string,
  right: string,
  width: number,
  borderColor: (text: string) => string,
) {
  if (width <= 0) return "";
  if (width <= 5) return borderColor("─".repeat(width));

  let leftLabel = left;
  let rightLabel = right;
  const labelGap = 3;

  while (visibleWidth(leftLabel) + visibleWidth(rightLabel) + labelGap + 2 > width) {
    if (visibleWidth(rightLabel) >= visibleWidth(leftLabel)) {
      rightLabel = truncateToWidth(rightLabel, Math.max(0, visibleWidth(rightLabel) - 1), "");
    } else {
      leftLabel = truncateToWidth(leftLabel, Math.max(0, visibleWidth(leftLabel) - 1), "");
    }
  }

  const fillWidth = width - visibleWidth(leftLabel) - visibleWidth(rightLabel) - 2;
  return `${borderColor("─")}${leftLabel}${borderColor("─".repeat(fillWidth))}${rightLabel}${borderColor("─")}`;
}

function findCommandDeckBottomBorder(
  lines: string[],
  width: number,
  borderColor: (text: string) => string,
) {
  const plainBorder = borderColor("─").repeat(width);
  const borderIndex = lines.indexOf(plainBorder, 2);
  if (borderIndex >= 0) return borderIndex;

  const scrollBorderIndex = lines.findIndex(
    (line, index) => index >= 2 && stripVTControlCharacters(line).startsWith("─── ↓ "),
  );
  return scrollBorderIndex >= 0 ? scrollBorderIndex : lines.length - 1;
}

function formatCommandDeckCwd(cwd: string) {
  return path.basename(cwd) || cwd;
}

function formatCommandDeckContext(ctx: ExtensionContext) {
  const percent = ctx.getContextUsage()?.percent;
  return percent === null || percent === undefined ? "ctx ?" : `ctx ${Math.round(percent)}%`;
}

function formatCommandDeckCacheHit(ctx: ExtensionContext) {
  const entry = ctx.sessionManager
    .getEntries()
    .findLast((entry) => entry.type === "message" && entry.message.role === "assistant");
  if (!entry || entry.type !== "message" || entry.message.role !== "assistant") return undefined;

  const usage = entry.message.usage;
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  return promptTokens > 0
    ? `cache ${((usage.cacheRead / promptTokens) * 100).toFixed(1)}%`
    : undefined;
}

function formatCommandDeckGitStatus(statusOutput: string | undefined, theme: Theme) {
  if (statusOutput === undefined) return "";

  const counts = { ahead: 0, behind: 0, conflicted: 0, modified: 0, untracked: 0 };
  for (const line of statusOutput.split("\n")) {
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      counts.ahead = Number(match?.[1] ?? 0);
      counts.behind = Number(match?.[2] ?? 0);
    } else if (line.startsWith("u ")) {
      counts.conflicted += 1;
    } else if (line.startsWith("? ")) {
      counts.untracked += 1;
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      counts.modified += 1;
    }
  }

  const tokens: string[] = [];
  if (counts.ahead) tokens.push(theme.fg("accent", `⇡${counts.ahead}`));
  if (counts.behind) tokens.push(theme.fg("warning", `⇣${counts.behind}`));
  if (counts.conflicted) tokens.push(theme.fg("error", `${counts.conflicted}`));
  if (counts.untracked) tokens.push(theme.fg("mdLink", `?${counts.untracked}`));
  if (counts.modified) tokens.push(theme.fg("warning", `${counts.modified}`));
  if (tokens.length === 0) tokens.push(theme.fg("success", ""));
  return tokens.join(theme.fg("dim", " · "));
}

/** Replaces Pi's editor and footer with a compact command deck that follows the active theme. */
export default function commandDeckEditor(pi: ExtensionAPI) {
  let activeTui: TUI | undefined;
  let getGitBranch = (): string | null => null;
  let gitStatusOutput: string | undefined;

  const refreshGitStatus = async (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui") return;
    const result = await pi
      .exec("git", ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"], {
        cwd: ctx.cwd,
        timeout: 2_000,
      })
      .catch(() => undefined);
    gitStatusOutput = result?.code === 0 ? result.stdout : undefined;
    activeTui?.requestRender();
  };

  pi.on("session_shutdown", () => {
    activeTui = undefined;
    gitStatusOutput = undefined;
  });

  pi.on("tool_execution_end", (_event, ctx) => refreshGitStatus(ctx));

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.setWorkingVisible(true);
    ctx.ui.setFooter((tui, theme, footerData) => {
      getGitBranch = () => footerData.getGitBranch();
      const stopWatchingBranch = footerData.onBranchChange(() => tui.requestRender());
      return {
        render(width: number) {
          const statuses = [...footerData.getExtensionStatuses()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, text]) =>
              text
                .replace(/[\r\n\t]/g, " ")
                .replace(/ +/g, " ")
                .trim(),
            )
            .filter(Boolean);
          return statuses.length === 0
            ? []
            : [truncateToWidth(statuses.join(theme.fg("dim", " · ")), width, theme.fg("dim", "…"))];
        },
        invalidate() {},
        dispose: stopWatchingBranch,
      };
    });

    class CommandDeckEditor extends CustomEditor {
      constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
        super(tui, theme, keybindings, { paddingX: 0 });
        activeTui = tui;
      }

      render(width: number): string[] {
        const lines = super.render(width);
        if (lines.length < 2) return lines;

        const theme = ctx.ui.theme;
        const borderColor = (text: string) => this.borderColor(text);
        const bottomBorderIndex = findCommandDeckBottomBorder(lines, width, borderColor);
        const model = ctx.model?.id ?? "no model";
        const thinking = pi.getThinkingLevel();
        const topRight = ` ${theme.fg("syntaxFunction", model)} ${theme.fg("dim", "·")} ${theme.getThinkingBorderColor(thinking)(thinking)} `;
        const branch = getGitBranch();
        const gitStatus = formatCommandDeckGitStatus(gitStatusOutput, theme);
        const bottomLeft = `${theme.fg("dim", ` ${formatCommandDeckCwd(ctx.cwd)}`)}${branch ? theme.fg("syntaxVariable", ` · ${branch}`) : ""}${gitStatus ? `${theme.fg("dim", " · ")}${gitStatus}` : ""} `;
        const bottomStatus = [
          theme.fg("syntaxNumber", formatCommandDeckCacheHit(ctx) ?? "cache ?"),
          theme.fg("muted", formatCommandDeckContext(ctx)),
        ].filter((status) => status !== undefined);
        const bottomRight = ` ${bottomStatus.join(theme.fg("dim", " · "))} `;

        lines[0] = renderCommandDeckBorder("", topRight, width, borderColor);
        lines[bottomBorderIndex] = renderCommandDeckBorder(
          bottomLeft,
          bottomRight,
          width,
          borderColor,
        );

        if (this.getText() === "" && lines[1]) {
          lines[1] = truncateToWidth(
            lines[1].replace(CURSOR, `${CURSOR}${theme.fg("muted", EMPTY_PROMPT)}`),
            width,
            "",
          );
        }

        return lines;
      }
    }

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new CommandDeckEditor(tui, theme, keybindings),
    );
    await refreshGitStatus(ctx);
  });
}
