import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  resolveMinimalSubagentsConfig,
  resolveMinimalSubagentsSettings,
} from "./minimal-subagents-config.js";

describe("resolveMinimalSubagentsConfig", () => {
  it("resolves one global advisory model role while preserving the default depth", () => {
    expect(
      resolveMinimalSubagentsConfig({
        globalSettings: {
          minimalSubagents: {
            modelRoles: {
              design: "opencode-go/kimi-k3",
            },
          },
        },
        projectSettings: {},
        eligibleModelIds: ["opencode-go/kimi-k3"],
      }),
    ).toEqual({
      maxSubagentDepth: 2,
      modelRoles: [{ name: "design", model: "opencode-go/kimi-k3" }],
      warnings: [],
    });
  });

  it("merges trusted project roles by name and applies project depth", () => {
    expect(
      resolveMinimalSubagentsConfig({
        globalSettings: {
          minimalSubagents: {
            maxSubagentDepth: 3,
            modelRoles: {
              cheap: "opencode-go/glm-5.2",
              design: {
                model: "opencode-go/kimi-k3",
                hint: "General design work",
              },
            },
          },
        },
        projectSettings: {
          minimalSubagents: {
            maxSubagentDepth: 1,
            modelRoles: {
              cheap: null,
              design: { hint: "UI design and frontend polish" },
              fast: "openai-codex/gpt-5.6-luna",
            },
          },
        },
        eligibleModelIds: [
          "opencode-go/glm-5.2",
          "opencode-go/kimi-k3",
          "openai-codex/gpt-5.6-luna",
        ],
      }),
    ).toEqual({
      maxSubagentDepth: 1,
      modelRoles: [
        {
          name: "design",
          model: "opencode-go/kimi-k3",
          hint: "UI design and frontend polish",
        },
        { name: "fast", model: "openai-codex/gpt-5.6-luna" },
      ],
      warnings: [],
    });
  });

  it("keeps valid guidance while warning about invalid project overrides", () => {
    expect(
      resolveMinimalSubagentsConfig({
        globalSettings: {
          minimalSubagents: {
            maxSubagentDepth: 3,
            modelRoles: {
              design: "opencode-go/kimi-k3",
            },
          },
        },
        projectSettings: {
          minimalSubagents: {
            maxSubagentDepth: 0,
            modelRoles: {
              smart: "openai-codex/gpt-5.6-sol:xhigh",
              offline: "openai-codex/unavailable",
              research: {
                model: "openai-codex/gpt-5.6-sol",
                hint: "Deep research",
                priority: 1,
              },
            },
          },
        },
        eligibleModelIds: ["opencode-go/kimi-k3", "openai-codex/gpt-5.6-sol"],
      }),
    ).toEqual({
      maxSubagentDepth: 3,
      modelRoles: [{ name: "design", model: "opencode-go/kimi-k3" }],
      warnings: [
        "project minimalSubagents.maxSubagentDepth: expected a positive safe integer or null",
        "project minimalSubagents.modelRoles.smart: thinking level suffixes are not allowed; choose thinking_level per spawn",
        "project minimalSubagents.modelRoles.offline: model is not eligible: openai-codex/unavailable",
        "project minimalSubagents.modelRoles.research: unknown field: priority",
      ],
    });
  });

  it("lets project null values clear roles and restore the built-in depth", () => {
    expect(
      resolveMinimalSubagentsConfig({
        globalSettings: {
          minimalSubagents: {
            maxSubagentDepth: 5,
            modelRoles: { smart: "openai-codex/gpt-5.6-sol" },
          },
        },
        projectSettings: {
          minimalSubagents: {
            maxSubagentDepth: null,
            modelRoles: null,
          },
        },
        eligibleModelIds: ["openai-codex/gpt-5.6-sol"],
      }),
    ).toEqual({ maxSubagentDepth: 2, modelRoles: [], warnings: [] });
  });
});

describe("resolveMinimalSubagentsSettings", () => {
  it("excludes project model roles when SettingsManager marks the project untrusted", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "minimal-subagents-global-settings-"));
    const projectDir = await mkdtemp(join(tmpdir(), "minimal-subagents-project-settings-"));
    await mkdir(join(projectDir, ".pi"));
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        minimalSubagents: {
          modelRoles: { global: "openai-codex/gpt-5.6-sol" },
        },
      }),
    );
    await writeFile(
      join(projectDir, ".pi", "settings.json"),
      JSON.stringify({
        minimalSubagents: {
          modelRoles: { project: "opencode-go/kimi-k3" },
        },
      }),
    );
    const settingsManager = SettingsManager.create(projectDir, agentDir, {
      projectTrusted: false,
    });

    expect(
      resolveMinimalSubagentsSettings(settingsManager, [
        "openai-codex/gpt-5.6-sol",
        "opencode-go/kimi-k3",
      ]),
    ).toEqual({
      maxSubagentDepth: 2,
      modelRoles: [{ name: "global", model: "openai-codex/gpt-5.6-sol" }],
      warnings: [],
    });
  });

  it("uses reloaded trusted project settings for the active depth", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "minimal-subagents-reload-global-"));
    const projectDir = await mkdtemp(join(tmpdir(), "minimal-subagents-reload-project-"));
    const projectSettingsDir = join(projectDir, ".pi");
    const projectSettingsPath = join(projectSettingsDir, "settings.json");
    await mkdir(projectSettingsDir);
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({ minimalSubagents: { maxSubagentDepth: 3 } }),
    );
    await writeFile(
      projectSettingsPath,
      JSON.stringify({ minimalSubagents: { maxSubagentDepth: 1 } }),
    );
    const settingsManager = SettingsManager.create(projectDir, agentDir, {
      projectTrusted: true,
    });
    expect(resolveMinimalSubagentsSettings(settingsManager, []).maxSubagentDepth).toBe(1);

    await writeFile(
      projectSettingsPath,
      JSON.stringify({ minimalSubagents: { maxSubagentDepth: 4 } }),
    );
    await settingsManager.reload();

    expect(resolveMinimalSubagentsSettings(settingsManager, []).maxSubagentDepth).toBe(4);
  });
});
