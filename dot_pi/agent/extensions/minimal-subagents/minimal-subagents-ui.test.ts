import { afterEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { AgentSummary, HierarchyStatusResult } from "./minimal-subagents-types.js";
import {
  buildMinimalSubagentsWidgetView,
  MinimalSubagentsUiController,
  renderMinimalSubagentsWidgetLines,
} from "./minimal-subagents-ui.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function agent(overrides: Partial<AgentSummary> & Pick<AgentSummary, "agent_id">): AgentSummary {
  const { agent_id: agentId, ...remaining } = overrides;
  return {
    agent_id: agentId,
    parent_id: "root",
    state: "idle",
    availability: "available",
    model: "openai/gpt",
    thinking_level: "high",
    tools: [],
    child_count: 0,
    children: [],
    ...remaining,
  };
}

describe("buildMinimalSubagentsWidgetView", () => {
  it("selects active nested agents, structural ancestors, and the three latest outcomes", () => {
    const hierarchy: HierarchyStatusResult = {
      root_id: "root",
      agents: [
        agent({
          agent_id: "lead",
          task: "Coordinate reviews",
          child_count: 1,
          children: [
            agent({
              agent_id: "lead.api",
              parent_id: "lead",
              state: "running",
              task: "Review the API",
              elapsed_ms: 2_000,
            }),
          ],
        }),
        agent({
          agent_id: "failed",
          task: "Run failure analysis",
          latest_turn: { turn_id: "failed-turn", status: "failed" },
          latest_activity_at: "2026-08-11T12:00:03.000Z",
        }),
        agent({
          agent_id: "completed",
          task: "Review tests",
          latest_turn: { turn_id: "complete-turn", status: "completed" },
          latest_activity_at: "2026-08-11T12:00:02.000Z",
        }),
        agent({
          agent_id: "cancelled",
          task: "Check cleanup",
          latest_turn: { turn_id: "cancelled-turn", status: "cancelled" },
          latest_activity_at: "2026-08-11T12:00:01.000Z",
        }),
        agent({
          agent_id: "old",
          latest_turn: { turn_id: "old-turn", status: "completed" },
          latest_activity_at: "2026-08-11T12:00:00.000Z",
        }),
      ],
    };

    const view = buildMinimalSubagentsWidgetView(hierarchy);
    expect(view.runningCount).toBe(1);
    expect(view.retainedCount).toBe(6);
    expect(view.recentCount).toBe(3);
    expect(view.rows.map((row) => row.agentId)).toEqual([
      "lead",
      "lead.api",
      "failed",
      "completed",
      "cancelled",
    ]);
    expect(view.rows[0]).toEqual(expect.objectContaining({ structural: true, task: undefined }));
    expect(view.rows[1]).toEqual(
      expect.objectContaining({ status: "running", task: "Review the API" }),
    );
  });

  it("prioritizes failed outcomes over newer successful outcomes", () => {
    const hierarchy: HierarchyStatusResult = {
      root_id: "root",
      agents: [
        agent({
          agent_id: "old-failure",
          latest_turn: { turn_id: "failed", status: "failed" },
          latest_activity_at: "2026-08-11T12:00:00.000Z",
        }),
        ...Array.from({ length: 3 }, (_, index) =>
          agent({
            agent_id: `recent-${index + 1}`,
            latest_turn: { turn_id: `completed-${index + 1}`, status: "completed" },
            latest_activity_at: `2026-08-11T12:00:0${index + 1}.000Z`,
          }),
        ),
      ],
    };

    const ids = buildMinimalSubagentsWidgetView(hierarchy).rows.map((row) => row.agentId);
    expect(ids).toContain("old-failure");
    expect(ids).not.toContain("recent-1");
  });

  it("caps agent rows at eight and renders every line within terminal width", () => {
    const hierarchy: HierarchyStatusResult = {
      root_id: "root",
      agents: Array.from({ length: 12 }, (_, index) =>
        agent({
          agent_id: `worker-${index + 1}`,
          state: "running",
          task: `Investigate a deliberately long task number ${index + 1}`,
        }),
      ),
    };
    const view = buildMinimalSubagentsWidgetView(hierarchy);
    expect(view.rows).toHaveLength(8);
    expect(view.overflowCount).toBe(4);
    const lines = renderMinimalSubagentsWidgetLines(view, 42, theme);
    expect(lines.at(-1)).toContain("… +4 more");
    expect(lines.every((line) => visibleWidth(line) <= 42)).toBe(true);
  });
});

describe("MinimalSubagentsUiController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows active status, retains terminal rows for ten seconds, then clears all UI", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    let hierarchy: HierarchyStatusResult = {
      root_id: "root",
      agents: [agent({ agent_id: "worker", state: "running", task: "Work" })],
    };
    const widgets: unknown[] = [];
    const statuses: Array<string | undefined> = [];
    const context = {
      mode: "tui",
      ui: {
        theme,
        setWidget: (_key: string, value: unknown) => widgets.push(value),
        setStatus: (_key: string, value: string | undefined) => statuses.push(value),
      },
    } as never;
    const coordinator = { inspectStatus: () => hierarchy } as never;
    const controller = new MinimalSubagentsUiController(coordinator, context);

    controller.refresh();
    expect(statuses.at(-1)).toBe("◉ 1 running · 1 retained");
    expect(widgets.at(-1)).toEqual(expect.any(Function));

    hierarchy = {
      root_id: "root",
      agents: [
        agent({
          agent_id: "worker",
          task: "Work",
          latest_turn: { turn_id: "turn", status: "completed" },
          latest_activity_at: "2026-08-11T12:00:01.000Z",
        }),
      ],
    };
    controller.refresh();
    expect(statuses.at(-1)).toBeUndefined();
    expect(widgets.at(-1)).toEqual(expect.any(Function));

    vi.advanceTimersByTime(10_000);
    expect(widgets.at(-1)).toBeUndefined();
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("creates no widget or presentation timer outside TUI mode", () => {
    vi.useFakeTimers();
    const setWidget = vi.fn();
    const setStatus = vi.fn();
    const context = { mode: "print", ui: { theme, setWidget, setStatus } } as never;
    const coordinator = {
      status: () => ({
        root_id: "root",
        agents: [agent({ agent_id: "worker", state: "running" })],
      }),
    } as never;
    const controller = new MinimalSubagentsUiController(coordinator, context);
    controller.refresh();
    expect(setWidget).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
