import { describe, expect, it } from "vitest";
import {
  buildEligibleModelIds,
  resolveOrdinaryToolSelection,
  stripThinkingSuffix,
} from "./minimal-subagents-capabilities.js";

describe("buildEligibleModelIds", () => {
  const availableModels = [
    { provider: "anthropic", id: "claude-sonnet" },
    { provider: "openai", id: "gpt-5.6-sol" },
    { provider: "openai", id: "gpt-5.6-terra" },
  ];

  it("uses resolved scoped models in stable deduplicated order", () => {
    expect(
      buildEligibleModelIds({
        availableModels,
        scopedModels: [
          { model: availableModels[1], thinkingLevel: "high" },
          { model: availableModels[0] },
          { model: availableModels[1] },
        ],
      }),
    ).toEqual(["openai/gpt-5.6-sol", "anthropic/claude-sonnet"]);
  });

  it("returns no models when a configured scope resolves to an empty set", () => {
    expect(
      buildEligibleModelIds({ availableModels, scopedModels: [], scopeConfigured: true }),
    ).toEqual([]);
  });

  it("uses every authenticated available model when no scope exists", () => {
    expect(buildEligibleModelIds({ availableModels, scopedModels: [] })).toEqual([
      "anthropic/claude-sonnet",
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
    ]);
  });

  it("preserves an empty authenticated model set", () => {
    expect(buildEligibleModelIds({ availableModels: [], scopedModels: [] })).toEqual([]);
  });
});

describe("stripThinkingSuffix", () => {
  it("strips only recognized trailing thinking suffixes", () => {
    expect(stripThinkingSuffix("openai/gpt-5.6-sol:xhigh")).toBe("openai/gpt-5.6-sol");
    expect(stripThinkingSuffix("provider/model:preview")).toBe("provider/model:preview");
  });
});

describe("resolveOrdinaryToolSelection", () => {
  const caller = {
    ordinaryTools: ["read", "grep"],
    capabilityCeiling: ["read", "grep", "find", "ls"],
    availableTools: ["read", "grep", "find", "ls", "bash", "custom_search"],
  };

  it("inherits the caller's active ordinary tools when omitted", () => {
    expect(resolveOrdinaryToolSelection(undefined, caller)).toEqual(["read", "grep"]);
  });

  it("expands fixed bundles without adding coordinator tools", () => {
    expect(resolveOrdinaryToolSelection("read", caller)).toEqual(["read", "grep", "find", "ls"]);
    expect(resolveOrdinaryToolSelection("none", caller)).toEqual([]);
  });

  it("resolves exact named custom tools", () => {
    expect(
      resolveOrdinaryToolSelection(["custom_search", "read"], {
        ...caller,
        capabilityCeiling: [...caller.capabilityCeiling, "custom_search"],
      }),
    ).toEqual(["custom_search", "read"]);
  });

  it("fails for missing dependencies and ceiling violations", () => {
    expect(() => resolveOrdinaryToolSelection(["missing"], caller)).toThrow(
      "Minimal subagents tool resolution: unavailable tool: missing",
    );
    expect(() =>
      resolveOrdinaryToolSelection("modify", {
        ...caller,
        availableTools: [...caller.availableTools, "edit", "write"],
      }),
    ).toThrow("Minimal subagents capability ceiling exceeded: bash, edit, write");
  });
});
