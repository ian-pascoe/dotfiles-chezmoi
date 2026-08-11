import { describe, expect, it } from "vitest";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  formatSubagentDuration,
  formatSubagentPreview,
  formatSubagentTokenCount,
  renderCoordinatorToolCall,
  renderCoordinatorToolResult,
  renderMinimalSubagentsMessage,
  renderMinimalSubagentsResult,
} from "./minimal-subagents-rendering.js";

initTheme(undefined, false);

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function render(component: { render(width: number): string[] }, width = 120): string {
  return component.render(width).join("\n");
}

describe("minimal subagents rendering formatters", () => {
  it("formats durations, tokens, and one-line previews with stable compact literals", () => {
    expect(formatSubagentDuration(830)).toBe("830ms");
    expect(formatSubagentDuration(128_000)).toBe("2m 08s");
    expect(formatSubagentTokenCount(12_400)).toBe("12.4k");
    expect(formatSubagentPreview("first\n  second", 12)).toBe("first second");
    expect(formatSubagentPreview("a long multiline preview", 12)).toBe("a long mult…");
    expect(visibleWidth(formatSubagentPreview("界界界界", 5))).toBeLessThanOrEqual(5);
  });
});

describe("renderCoordinatorToolCall", () => {
  it("renders purpose-specific call summaries", () => {
    expect(
      render(
        renderCoordinatorToolCall(
          "subagent",
          { agent_id: "reviewer", task: "Review the complete API" },
          theme,
        ),
      ),
    ).toContain("Subagent reviewer · “Review the complete API”");
    expect(
      render(
        renderCoordinatorToolCall(
          "subagent_delete",
          { agent_id: "root.old", recursive: false },
          theme,
        ),
      ),
    ).toContain("Delete root.old · target only");
  });
});

describe("renderCoordinatorToolResult", () => {
  it("renders compact and expanded wait results without raw JSON in the compact row", () => {
    const result = {
      content: [{ type: "text" as const, text: "machine-readable output" }],
      details: {
        agent_id: "root.reviewer",
        turn_id: "turn-1",
        status: "completed",
        output: "# Reviewed\n\nEverything passes.",
        elapsed_ms: 2_500,
        usage: {
          input: 1_000,
          output: 800,
          cacheRead: 200,
          cacheWrite: 0,
          totalTokens: 2_000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    };
    const collapsed = render(
      renderCoordinatorToolResult(
        "subagent_wait",
        result,
        { expanded: false, isPartial: false },
        theme,
        { agent_id: "root.reviewer" },
      ),
    );
    expect(collapsed).toContain("✓ root.reviewer · completed · 2s · 2.0k tokens");
    expect(collapsed).not.toContain("turn-1");

    const expanded = render(
      renderCoordinatorToolResult(
        "subagent_wait",
        result,
        { expanded: true, isPartial: false },
        theme,
        { agent_id: "root.reviewer" },
      ),
    );
    expect(expanded).toContain("Turn: turn-1");
    expect(expanded).toContain("Reviewed");
    expect(expanded).toContain("cache read 200");
  });

  it("renders complete expanded launch, status, and management details", () => {
    const spawn = render(
      renderCoordinatorToolResult(
        "subagent",
        {
          content: [{ type: "text", text: "{}" }],
          details: {
            agent_id: "root.worker",
            turn_id: "turn-1",
            status: "running",
            agent: {
              launch_contract: {
                session_context: "omit",
                project_context: "inherit",
                model: "openai/gpt",
                thinking_level: "high",
                delegation: "none",
                ordinary_tools: ["read", "bash"],
              },
            },
          },
        },
        { expanded: true, isPartial: false },
        theme,
        { task: "Review" },
      ),
    );
    expect(spawn).toContain("Resolved tools");
    expect(spawn).toContain("read, bash");

    const status = render(
      renderCoordinatorToolResult(
        "subagent_status",
        {
          content: [{ type: "text", text: "{}" }],
          details: {
            agent: {
              agent_id: "root.worker",
              parent_id: "root",
              state: "idle",
              availability: "available",
              latest_turn: { turn_id: "turn-1", status: "completed" },
              elapsed_ms: 2_500,
              child_count: 0,
              children: [],
            },
          },
        },
        { expanded: true, isPartial: false },
        theme,
        {},
      ),
    );
    expect(status).toContain("Availability: available");
    expect(status).toContain("Duration: 2s");

    for (const [toolName, details] of [
      [
        "subagent_cancel",
        {
          agent_id: "root.worker",
          recursive: false,
          affected_agent_ids: ["root.worker"],
          cancelled_turn_ids: [],
        },
      ],
      [
        "subagent_delete",
        {
          agent_id: "root.worker",
          recursive: true,
          deleted_agent_ids: ["root.worker"],
          tombstoned_agent_ids: ["root.worker"],
          trashed_session_files: [],
          failures: [],
        },
      ],
    ] as const) {
      const output = render(
        renderCoordinatorToolResult(
          toolName,
          { content: [{ type: "text", text: "{}" }], details },
          { expanded: true, isPartial: false },
          theme,
          {},
        ),
      );
      expect(output).toContain("Requested target: root.worker");
      expect(output).toContain(
        toolName === "subagent_cancel" ? "Mode: target only" : "Mode: recursive",
      );
    }
  });

  it("renders hierarchy and destructive results as curated summaries", () => {
    const hierarchy = render(
      renderCoordinatorToolResult(
        "subagent_status",
        {
          content: [{ type: "text", text: "{}" }],
          details: {
            root_id: "root",
            agents: [
              {
                agent_id: "root.lead",
                state: "running",
                availability: "available",
                child_count: 1,
                children: [
                  {
                    agent_id: "root.lead.review",
                    state: "idle",
                    availability: "available",
                    latest_turn: { status: "failed" },
                    child_count: 0,
                    children: [],
                  },
                ],
              },
            ],
          },
        },
        { expanded: true, isPartial: false },
        theme,
        {},
      ),
    );
    expect(hierarchy).toContain("2 retained · 1 running");
    expect(hierarchy).toContain("× root.lead.review · failed");
  });

  it("falls back to actionable tool text when details are unavailable or incompatible", () => {
    for (const details of [undefined, {}]) {
      const output = render(
        renderCoordinatorToolResult(
          "subagent_delete",
          { content: [{ type: "text", text: "Deletion failed safely" }], details },
          { expanded: false, isPartial: false },
          theme,
          {},
          true,
        ),
      );
      expect(output).toContain("Deletion failed safely");
    }
  });
});

describe("minimal subagents custom message renderers", () => {
  it("distinguishes explicit messages and automatic results", () => {
    const details = {
      source_agent_id: "root.reviewer",
      destination_agent_id: "root",
      source_turn_id: "turn-1",
      status: "completed" as const,
    };
    expect(
      render(
        renderMinimalSubagentsMessage(
          { content: "Need a decision", details },
          { expanded: false, outputPad: 0 },
          theme,
        ),
      ),
    ).toContain("Agent message · root.reviewer → root");
    expect(
      render(
        renderMinimalSubagentsResult(
          { content: "# Complete", details },
          { expanded: true, outputPad: 0 },
          theme,
        ),
      ),
    ).toContain("Agent result · root.reviewer → root · completed");
  });
});
