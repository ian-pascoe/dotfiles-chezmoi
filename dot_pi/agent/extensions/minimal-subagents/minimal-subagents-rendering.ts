import type { Usage } from "@earendil-works/pi-ai";
import {
  getMarkdownTheme,
  keyHint,
  type AgentToolResult,
  type Theme,
  type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Markdown, Spacer, Text, type Component } from "@earendil-works/pi-tui";
export type CoordinatorToolName =
  | "subagent"
  | "subagent_message"
  | "subagent_wait"
  | "subagent_status"
  | "subagent_cancel"
  | "subagent_delete";

interface RenderableCoordinatorMessage {
  content: unknown;
  details?: unknown;
}

interface CoordinatorMessageRenderOptions {
  expanded: boolean;
  outputPad: number;
}

const TERMINAL_STATUS_SYMBOLS: Record<string, string> = {
  running: "◉",
  waiting: "◌",
  completed: "✓",
  failed: "×",
  cancelled: "■",
  interrupted: "!",
  unavailable: "!",
  idle: "○",
  delivered: "→",
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function coordinatorMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      const block = asRecord(item);
      return block?.type === "text" ? (asString(block.text) ?? "") : "";
    })
    .filter(Boolean)
    .join("\n");
}

function toolResultText(result: AgentToolResult<unknown>): string {
  const text = result.content.find((item) => item.type === "text");
  return text?.type === "text" ? text.text : "";
}

function coordinatorStatusColor(
  status: string,
): "accent" | "success" | "error" | "warning" | "dim" {
  if (status === "running" || status === "waiting" || status === "delivered") return "accent";
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "cancelled" || status === "interrupted" || status === "unavailable") {
    return "warning";
  }
  return "dim";
}

function styledCoordinatorStateSymbol(theme: Theme, status: string): string {
  const symbol = TERMINAL_STATUS_SYMBOLS[status] ?? "○";
  return theme.fg(coordinatorStatusColor(status), symbol);
}

function renderLabelValue(theme: Theme, label: string, value: unknown): Text {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return new Text(`${theme.fg("muted", `${label}:`)} ${text ?? ""}`, 0, 0);
}

function appendSection(
  container: Container,
  theme: Theme,
  label: string,
  content: string | Component,
): void {
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", `── ${label} ──`), 0, 0));
  container.addChild(typeof content === "string" ? new Text(content, 0, 0) : content);
}

function renderFallbackToolResult(
  result: AgentToolResult<unknown>,
  theme: Theme,
  isError: boolean,
): Component {
  const content = toolResultText(result) || "(no output)";
  return new Text(isError ? theme.fg("error", content) : content, 0, 0);
}

function collapsedExpansionHint(theme: Theme): string {
  return theme.fg("dim", ` · ${keyHint("app.tools.expand", "to expand")}`);
}

/** Format milliseconds for compact subagent rows without losing sub-second durations. */
export function formatSubagentDuration(elapsedMs: number | undefined): string | undefined {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return undefined;
  if (elapsedMs < 1_000) return `${Math.round(elapsedMs)}ms`;
  const seconds = Math.floor(elapsedMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Format token counts as compact decimal values for transcript and widget summaries. */
export function formatSubagentTokenCount(tokens: number | undefined): string | undefined {
  if (tokens === undefined || !Number.isFinite(tokens) || tokens < 0) return undefined;
  if (tokens < 1_000) return String(Math.round(tokens));
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(tokens < 10_000_000 ? 1 : 0)}m`;
}

/** Collapse multiline task or message text into one terminal-friendly preview. */
export function formatSubagentPreview(content: string, maxCharacters = 72): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxCharacters
    ? singleLine
    : `${singleLine.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
}

/** Format complete Pi usage metrics for expanded subagent output. */
export function formatSubagentUsage(usage: Usage | undefined): string | undefined {
  const usageRecord = asRecord(usage);
  if (!usageRecord) return undefined;
  const values = [
    `input ${formatSubagentTokenCount(asNumber(usageRecord.input)) ?? "0"}`,
    `output ${formatSubagentTokenCount(asNumber(usageRecord.output)) ?? "0"}`,
    `cache read ${formatSubagentTokenCount(asNumber(usageRecord.cacheRead)) ?? "0"}`,
    `cache write ${formatSubagentTokenCount(asNumber(usageRecord.cacheWrite)) ?? "0"}`,
    `total ${formatSubagentTokenCount(asNumber(usageRecord.totalTokens)) ?? "0"}`,
  ];
  const totalCost = asNumber(asRecord(usageRecord.cost)?.total);
  if (totalCost !== undefined && totalCost > 0) values.push(`cost $${totalCost.toFixed(4)}`);
  return values.join(" · ");
}

function renderSubagentCall(
  toolName: CoordinatorToolName,
  args: Record<string, unknown>,
  theme: Theme,
): Component {
  const title = (label: string) => theme.fg("toolTitle", theme.bold(label));
  const preview = (value: unknown) =>
    typeof value === "string" && value.length > 0
      ? ` · ${theme.fg("dim", `“${formatSubagentPreview(value)}”`)}`
      : "";
  switch (toolName) {
    case "subagent":
      return new Text(
        `${title("Subagent")} ${theme.fg("accent", asString(args.agent_id) ?? "generated")}${preview(args.task)}`,
        0,
        0,
      );
    case "subagent_message":
      return new Text(
        `${title("Message")} ${theme.fg("accent", asString(args.agent_id) ?? "parent")}${preview(args.message)}`,
        0,
        0,
      );
    case "subagent_wait":
      return new Text(
        `${title("Wait")} ${theme.fg("accent", asString(args.agent_id) ?? "agent")}`,
        0,
        0,
      );
    case "subagent_status":
      return new Text(
        `${title("Status")} ${theme.fg("accent", asString(args.agent_id) ?? "hierarchy")}`,
        0,
        0,
      );
    case "subagent_cancel":
      return new Text(
        `${title("Cancel")} ${theme.fg("accent", asString(args.agent_id) ?? "agent")} ${theme.fg("dim", args.recursive === false ? "· target only" : "· recursive")}`,
        0,
        0,
      );
    case "subagent_delete":
      return new Text(
        `${title("Delete")} ${theme.fg("accent", asString(args.agent_id) ?? "agent")} ${theme.fg("dim", args.recursive === false ? "· target only" : "· recursive")}`,
        0,
        0,
      );
  }
}

function renderSpawnResult(
  details: Record<string, unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  args: Record<string, unknown>,
): Component {
  const agentId = asString(details.agent_id) ?? "subagent";
  const status = asString(details.status) ?? "running";
  if (!options.expanded) {
    return new Text(
      `${styledCoordinatorStateSymbol(theme, status)} ${theme.fg("accent", agentId)} · ${status}${collapsedExpansionHint(theme)}`,
      0,
      0,
    );
  }
  const container = new Container();
  container.addChild(
    new Text(
      `${styledCoordinatorStateSymbol(theme, status)} ${theme.fg("toolTitle", theme.bold(agentId))} · ${status}`,
      0,
      0,
    ),
  );
  container.addChild(renderLabelValue(theme, "Turn", asString(details.turn_id) ?? "unknown"));
  appendSection(container, theme, "Task", asString(args.task) ?? "(task unavailable)");
  const launch = [
    `delegation ${asString(args.delegation) ?? "none"}`,
    `session context ${asString(args.session_context) ?? "inherit"}`,
    `project context ${asString(args.project_context) ?? "inherit"}`,
    asString(args.model) ? `model ${String(args.model)}` : undefined,
    asString(args.thinking_level) ? `thinking ${String(args.thinking_level)}` : undefined,
    args.tools !== undefined
      ? `tools ${Array.isArray(args.tools) ? args.tools.join(", ") : String(args.tools)}`
      : "tools inherited",
  ].filter(Boolean);
  appendSection(container, theme, "Launch", launch.join(" · "));
  return container;
}

function renderMessageResult(
  details: Record<string, unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  args: Record<string, unknown>,
): Component {
  const deliveries = Array.isArray(details.deliveries)
    ? details.deliveries
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  const delivered = deliveries.filter((item) => item.delivered === true).length;
  const behavior = asString(details.behavior) ?? asString(args.behavior) ?? "steer";
  const failed = deliveries.length > 0 && delivered === 0;
  const summary = failed
    ? `${styledCoordinatorStateSymbol(theme, "failed")} 0/${deliveries.length} delivered · failed · ${behavior}`
    : `${theme.fg("accent", "→")} ${delivered}/${deliveries.length} delivered · ${behavior}`;
  if (!options.expanded) return new Text(`${summary}${collapsedExpansionHint(theme)}`, 0, 0);
  const container = new Container();
  container.addChild(new Text(summary, 0, 0));
  appendSection(container, theme, "Message", asString(args.message) ?? "(message unavailable)");
  appendSection(
    container,
    theme,
    "Recipients",
    deliveries
      .map((item) => {
        const id = asString(item.agent_id) ?? "unknown";
        return item.delivered === true
          ? `${theme.fg("success", "✓ delivered")} ${id}`
          : `${theme.fg("error", "× failed")} ${id} · ${asString(item.error) ?? "unknown error"}`;
      })
      .join("\n") || "(no recipients)",
  );
  return container;
}

function renderWaitResult(
  details: Record<string, unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  args: Record<string, unknown>,
): Component {
  const agentId = asString(details.agent_id) ?? asString(args.agent_id) ?? "agent";
  const status = options.isPartial ? "waiting" : (asString(details.status) ?? "completed");
  const duration = formatSubagentDuration(asNumber(details.elapsed_ms));
  const usage = asRecord(details.usage) as Usage | undefined;
  const tokens = formatSubagentTokenCount(usage?.totalTokens);
  const metrics = [duration, tokens ? `${tokens} tokens` : undefined].filter(Boolean).join(" · ");
  const summary = `${styledCoordinatorStateSymbol(theme, status)} ${theme.fg("accent", agentId)} · ${status}${metrics ? ` · ${metrics}` : ""}`;
  if (options.isPartial || !options.expanded) {
    return new Text(`${summary}${options.isPartial ? "" : collapsedExpansionHint(theme)}`, 0, 0);
  }
  const container = new Container();
  container.addChild(new Text(summary, 0, 0));
  container.addChild(renderLabelValue(theme, "Turn", asString(details.turn_id) ?? "unknown"));
  const output = asString(details.output) ?? "";
  if (status === "completed") {
    appendSection(
      container,
      theme,
      "Output",
      output.length > 0 ? new Markdown(output, 0, 0, getMarkdownTheme()) : "(no output)",
    );
  } else {
    appendSection(
      container,
      theme,
      "Error",
      (asString(details.error) ?? output) || "(no error detail)",
    );
    appendSection(container, theme, "Diagnostics", JSON.stringify(details, null, 2));
  }
  const usageText = formatSubagentUsage(usage);
  if (usageText) appendSection(container, theme, "Usage", usageText);
  return container;
}

function countStatusAgents(agents: unknown[]): { retained: number; running: number } {
  let retained = 0;
  let running = 0;
  for (const item of agents) {
    const agent = asRecord(item);
    if (!agent) continue;
    retained++;
    if (agent.state === "running") running++;
    const childCounts = countStatusAgents(Array.isArray(agent.children) ? agent.children : []);
    retained += childCounts.retained;
    running += childCounts.running;
  }
  return { retained, running };
}

function renderStatusTreeRows(agents: unknown[], theme: Theme, depth = 0): string[] {
  const rows: string[] = [];
  for (const item of agents) {
    const agent = asRecord(item);
    if (!agent) continue;
    const availability = asString(agent.availability) ?? "available";
    const latestTurn = asRecord(agent.latest_turn);
    const status =
      availability === "unavailable"
        ? "unavailable"
        : asString(agent.state) === "running"
          ? "running"
          : (asString(latestTurn?.status) ?? "idle");
    const duration = formatSubagentDuration(asNumber(agent.elapsed_ms));
    const childCount = asNumber(agent.child_count) ?? 0;
    rows.push(
      `${"  ".repeat(depth)}${styledCoordinatorStateSymbol(theme, status)} ${asString(agent.agent_id) ?? "unknown"} · ${status}${duration ? ` · ${duration}` : ""}${childCount > 0 ? ` · ${childCount} children` : ""}`,
    );
    rows.push(
      ...renderStatusTreeRows(
        Array.isArray(agent.children) ? agent.children : [],
        theme,
        depth + 1,
      ),
    );
  }
  return rows;
}

function renderStatusResult(
  details: Record<string, unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  const agents = Array.isArray(details.agents) ? details.agents : undefined;
  if (agents) {
    const counts = countStatusAgents(agents);
    const summary = `${theme.fg("dim", "○")} ${counts.retained} retained · ${counts.running} running`;
    if (!options.expanded) return new Text(`${summary}${collapsedExpansionHint(theme)}`, 0, 0);
    return new Text(
      `${summary}\n${renderStatusTreeRows(agents, theme).join("\n") || theme.fg("dim", "(no agents)")}`,
      0,
      0,
    );
  }
  const agent = asRecord(details.agent);
  if (!agent) return new Text(theme.fg("dim", "○ 0 retained · 0 running"), 0, 0);
  const availability = asString(agent.availability) ?? "available";
  const latestTurn = asRecord(agent.latest_turn);
  const status =
    availability === "unavailable"
      ? "unavailable"
      : asString(agent.state) === "running"
        ? "running"
        : (asString(latestTurn?.status) ?? "idle");
  const id = asString(agent.agent_id) ?? "agent";
  const childCount = asNumber(agent.child_count) ?? 0;
  const summary = `${styledCoordinatorStateSymbol(theme, status)} ${id} · ${status} · ${childCount} children`;
  if (!options.expanded) return new Text(`${summary}${collapsedExpansionHint(theme)}`, 0, 0);
  const container = new Container();
  container.addChild(new Text(summary, 0, 0));
  for (const [label, value] of [
    ["Parent", agent.parent_id],
    ["Turn", agent.active_turn_id ?? asRecord(agent.latest_turn)?.turn_id],
    ["Model", agent.model],
    ["Thinking", agent.thinking_level],
    ["Session", agent.session_file],
    ["Spawn entry", agent.spawn_entry_id],
  ] as const) {
    if (value !== undefined) container.addChild(renderLabelValue(theme, label, value));
  }
  if (asString(agent.task)) appendSection(container, theme, "Task", String(agent.task));
  const launchContract = asRecord(agent.launch_contract);
  if (launchContract) {
    const launchValues = [
      `session context ${asString(launchContract.session_context) ?? "inherit"}`,
      `project context ${asString(launchContract.project_context) ?? "inherit"}`,
      `model ${asString(launchContract.model) ?? asString(agent.model) ?? "unknown"}`,
      `thinking ${asString(launchContract.thinking_level) ?? asString(agent.thinking_level) ?? "unknown"}`,
      `delegation ${asString(launchContract.delegation) ?? "none"}`,
    ];
    appendSection(container, theme, "Launch contract", launchValues.join(" · "));
  }
  appendSection(container, theme, "Tools", asStringArray(agent.tools).join(", ") || "none");
  appendSection(
    container,
    theme,
    "Capability ceiling",
    asStringArray(agent.capability_ceiling).join(", ") || "none",
  );
  const missing = asStringArray(agent.missing_dependencies);
  if (missing.length > 0)
    appendSection(container, theme, "Missing dependencies", missing.join("\n"));
  if (asString(agent.unavailable_reason)) {
    appendSection(container, theme, "Unavailable reason", String(agent.unavailable_reason));
  }
  const recentMessages = Array.isArray(agent.recent_messages)
    ? agent.recent_messages
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  if (recentMessages.length > 0) {
    appendSection(
      container,
      theme,
      "Recent messages",
      recentMessages
        .map(
          (message) =>
            `${asString(message.source_agent_id) ?? "unknown"}: ${asString(message.content) ?? ""}`,
        )
        .join("\n"),
    );
  }
  const latestResult = asRecord(agent.latest_result);
  if (latestResult) {
    const output = asString(latestResult.output) ?? "";
    appendSection(
      container,
      theme,
      "Latest result",
      asString(latestResult.status) === "completed" && output
        ? new Markdown(output, 0, 0, getMarkdownTheme())
        : output || JSON.stringify(latestResult, null, 2),
    );
  }
  for (const [label, usageValue] of [
    ["Usage", agent.usage],
    ["Descendant usage", agent.descendant_usage],
  ] as const) {
    const usageText = formatSubagentUsage(asRecord(usageValue) as Usage | undefined);
    if (usageText) appendSection(container, theme, label, usageText);
  }
  return container;
}

function renderCancelResult(
  details: Record<string, unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  const id = asString(details.agent_id) ?? "agent";
  const turns = asStringArray(details.cancelled_turn_ids);
  const summary =
    turns.length > 0
      ? `${styledCoordinatorStateSymbol(theme, "cancelled")} ${id} · cancelled · ${turns.length} turns cancelled`
      : `${styledCoordinatorStateSymbol(theme, "completed")} ${id} · no active turns`;
  if (!options.expanded) return new Text(`${summary}${collapsedExpansionHint(theme)}`, 0, 0);
  const affected = asStringArray(details.affected_agent_ids);
  return new Text(
    `${summary}\n${theme.fg("muted", "Affected agents:")}\n${affected.join("\n") || "(none)"}\n${theme.fg("muted", "Cancelled turns:")}\n${turns.join("\n") || "(none)"}`,
    0,
    0,
  );
}

function renderDeleteResult(
  details: Record<string, unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
): Component {
  const id = asString(details.agent_id) ?? "agent";
  const deleted = asStringArray(details.deleted_agent_ids);
  const tombstoned = asStringArray(details.tombstoned_agent_ids);
  const failures = Array.isArray(details.failures) ? details.failures : [];
  const status = failures.length > 0 ? "failed" : "completed";
  const summary = `${styledCoordinatorStateSymbol(theme, status)} ${id} · ${status} · ${deleted.length} agents deleted · ${tombstoned.length} tombstoned${failures.length > 0 ? ` · ${failures.length} failed` : ""}`;
  if (!options.expanded) return new Text(`${summary}${collapsedExpansionHint(theme)}`, 0, 0);
  const container = new Container();
  container.addChild(new Text(summary, 0, 0));
  appendSection(container, theme, "Deleted agents", deleted.join("\n") || "(none)");
  appendSection(container, theme, "Tombstones", tombstoned.join("\n") || "(none)");
  appendSection(
    container,
    theme,
    "Trashed sessions",
    asStringArray(details.trashed_session_files).join("\n") || "(none)",
  );
  if (failures.length > 0) {
    appendSection(
      container,
      theme,
      "Failures",
      theme.fg("error", JSON.stringify(failures, null, 2)),
    );
  }
  return container;
}

/** Render one of the six coordinator tool calls with a shared native Pi grammar. */
export function renderCoordinatorToolCall(
  toolName: CoordinatorToolName,
  args: Record<string, unknown>,
  theme: Theme,
): Component {
  return renderSubagentCall(toolName, args, theme);
}

/** Render one coordinator tool result in native collapsed, expanded, or partial mode. */
export function renderCoordinatorToolResult(
  toolName: CoordinatorToolName,
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: Theme,
  args: Record<string, unknown>,
  isError = false,
): Component {
  const details = asRecord(result.details);
  if (!details) return renderFallbackToolResult(result, theme, isError);
  switch (toolName) {
    case "subagent":
      return renderSpawnResult(details, options, theme, args);
    case "subagent_message":
      return renderMessageResult(details, options, theme, args);
    case "subagent_wait":
      return renderWaitResult(details, options, theme, args);
    case "subagent_status":
      return renderStatusResult(details, options, theme);
    case "subagent_cancel":
      return renderCancelResult(details, options, theme);
    case "subagent_delete":
      return renderDeleteResult(details, options, theme);
  }
}

/** Render explicit agent messages with compact source/destination metadata. */
export function renderMinimalSubagentsMessage(
  message: RenderableCoordinatorMessage,
  options: CoordinatorMessageRenderOptions,
  theme: Theme,
): Component {
  return renderCoordinatorMessage("Agent message", "→", message, options, theme);
}

/** Render automatic successful agent results with expandable Markdown output. */
export function renderMinimalSubagentsResult(
  message: RenderableCoordinatorMessage,
  options: CoordinatorMessageRenderOptions,
  theme: Theme,
): Component {
  return renderCoordinatorMessage("Agent result", "✓", message, options, theme);
}

function renderCoordinatorMessage(
  label: string,
  symbol: string,
  message: RenderableCoordinatorMessage,
  options: CoordinatorMessageRenderOptions,
  theme: Theme,
): Component {
  const details = asRecord(message.details);
  const content = coordinatorMessageText(message.content);
  const source = asString(details?.source_agent_id) ?? "unknown";
  const destination = asString(details?.destination_agent_id) ?? "recipient";
  const status = asString(details?.status);
  const heading = `${theme.fg(symbol === "✓" ? "success" : "accent", symbol)} ${theme.bold(label)} · ${source} → ${destination}${status ? ` · ${status}` : ""}`;
  const box = new Box(options.outputPad, 1, (text) => theme.bg("customMessageBg", text));
  if (!options.expanded) {
    box.addChild(
      new Text(`${heading}\n${theme.fg("muted", formatSubagentPreview(content))}`, 0, 0),
    );
    return box;
  }
  const container = new Container();
  container.addChild(new Text(heading, 0, 0));
  if (asString(details?.source_turn_id)) {
    container.addChild(renderLabelValue(theme, "Source turn", details?.source_turn_id));
  }
  const duration = formatSubagentDuration(asNumber(details?.elapsed_ms));
  if (duration) container.addChild(renderLabelValue(theme, "Duration", duration));
  container.addChild(new Spacer(1));
  container.addChild(new Markdown(content, 0, 0, getMarkdownTheme()));
  const usageText = formatSubagentUsage(asRecord(details?.usage) as Usage | undefined);
  if (usageText) appendSection(container, theme, "Usage", usageText);
  box.addChild(container);
  return box;
}
