import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createChildResourceLoaderOptions,
  createPersistentChildIdentity,
  findDeliveryEvidence,
  PiAgentSessionFactory,
} from "./minimal-subagents-sessions.js";
import type { PersistedAgent } from "./minimal-subagents-types.js";

function persistedAgent(): PersistedAgent {
  return {
    agent_id: "worker",
    friendly_id: "worker",
    parent_id: "root",
    created_at: "2026-08-11T00:00:00.000Z",
    spawn_entry_id: "spawn-entry",
    launch_contract: {
      session_context: "omit",
      project_context: "omit",
      model: "openai/gpt",
      thinking_level: "high",
      tools: "none",
      ordinary_tools: [],
    },
    capability_ceiling: [],
    availability: "available",
    missing_dependencies: [],
    recent_messages: [],
  };
}

describe("createPersistentChildIdentity", () => {
  it("forces a normal JSONL session file before the first assistant response", async () => {
    const sessionDir = await mkdtemp(join(tmpdir(), "minimal-subagents-session-"));
    const identity = createPersistentChildIdentity({
      agent: persistedAgent(),
      importedMessages: [],
      cwd: "/project",
      sessionDir,
      rootSessionId: "root-session",
    });

    expect(existsSync(identity.sessionFile)).toBe(true);
    const entries = readFileSync(identity.sessionFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries[0]).toEqual(expect.objectContaining({ type: "session", cwd: "/project" }));
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "custom",
          customType: "minimal-subagents.identity",
          data: expect.objectContaining({
            canonical_agent_id: "worker",
            original_root_session_id: "root-session",
          }),
        }),
        expect.objectContaining({ type: "session_info", name: "[subagent] worker" }),
      ]),
    );
  });

  it("force-flushes a fork clone even when the child has no assistant response", async () => {
    const sessionDir = await mkdtemp(join(tmpdir(), "minimal-subagents-clone-"));
    const agent = persistedAgent();
    const identity = createPersistentChildIdentity({
      agent,
      importedMessages: [],
      cwd: "/project",
      sessionDir,
      rootSessionId: "root-session",
    });
    agent.session_file = identity.sessionFile;
    agent.session_id = identity.sessionId;
    const factory = new PiAgentSessionFactory({
      cwd: "/project",
      agentDir: sessionDir,
      sessionDir,
      rootSessionId: "root-session",
      extensionEntrypoint: join(sessionDir, "extensions", "minimal-subagents.ts"),
      models: [{ provider: "openai", id: "gpt" } as never],
      eligibleModelIds: ["openai/gpt"],
      modelScopeRestricted: false,
      availableToolNames: [],
      projectTrusted: true,
      getCoordinatorTools: () => [],
    });

    const clone = await factory.cloneSession(agent);
    expect(clone.sessionFile).not.toBe(identity.sessionFile);
    expect(existsSync(clone.sessionFile)).toBe(true);
    expect(readFileSync(clone.sessionFile, "utf8")).toContain(
      '"customType":"minimal-subagents.fork-clone"',
    );
  });
});

describe("createChildResourceLoaderOptions", () => {
  it("keeps only tool-providing extensions and excludes project resources in omit mode", () => {
    const options = createChildResourceLoaderOptions({
      cwd: "/project",
      agentDir: "/agent",
      projectContext: "omit",
      extensionEntrypoint: "/agent/extensions/minimal-subagents.ts",
      systemPromptBlock: "identity block",
      ordinaryToolNames: ["custom_tool"],
    });
    expect(options.noExtensions).toBe(false);
    expect(options.noContextFiles).toBe(true);
    expect(options.noSkills).toBe(true);
    expect(options.noPromptTemplates).toBe(true);
    const unrelatedExtension = {
      resolvedPath: "/agent/extensions/widget.ts",
      tools: new Map(),
    } as never;
    expect(
      options.extensionsOverride?.({
        extensions: [unrelatedExtension],
        errors: [],
        runtime: {} as never,
      }).extensions,
    ).toEqual([]);
    expect(
      options.agentsFilesOverride?.({ agentsFiles: [{ path: "AGENTS.md", content: "x" }] }),
    ).toEqual({
      agentsFiles: [],
    });
    expect(options.appendSystemPromptOverride?.(["project append"])).toEqual(["identity block"]);
  });

  it("skips extension factories when the child requests only Pi built-in tools", () => {
    const options = createChildResourceLoaderOptions({
      cwd: "/project",
      agentDir: "/agent",
      projectContext: "inherit",
      extensionEntrypoint: "/agent/extensions/minimal-subagents.ts",
      systemPromptBlock: "identity block",
      ordinaryToolNames: ["read", "bash"],
    });
    expect(options.noExtensions).toBe(true);
    expect(options.extensionsOverride).toBeUndefined();
  });
});

describe("PiAgentSessionFactory launch validation", () => {
  it("rejects runtime-only custom tools before persistent child creation", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "minimal-subagents-agent-"));
    const factory = new PiAgentSessionFactory({
      cwd: agentDir,
      agentDir,
      sessionDir: agentDir,
      rootSessionId: "root-session",
      extensionEntrypoint: join(agentDir, "extensions", "minimal-subagents.ts"),
      models: [{ provider: "openai", id: "gpt" } as never],
      eligibleModelIds: ["openai/gpt"],
      modelScopeRestricted: false,
      availableToolNames: ["read", "runtime_only_tool"],
      projectTrusted: true,
      getCoordinatorTools: () => [],
    });
    const agent = persistedAgent();
    agent.launch_contract.ordinary_tools = ["runtime_only_tool"];

    await expect(factory.resolveLaunchMissingDependencies(agent)).resolves.toEqual([
      "runtime_only_tool",
    ]);
  });
});

describe("PiAgentSessionFactory session deletion", () => {
  it("deletes the session file when the trash CLI is unavailable", async () => {
    const sessionDir = await mkdtemp(join(tmpdir(), "minimal-subagents-delete-"));
    const sessionFile = join(sessionDir, "child.jsonl");
    writeFileSync(sessionFile, "session\n", "utf8");
    const factory = new PiAgentSessionFactory({
      cwd: sessionDir,
      agentDir: sessionDir,
      sessionDir,
      rootSessionId: "root-session",
      extensionEntrypoint: join(sessionDir, "extensions", "minimal-subagents.ts"),
      models: [],
      eligibleModelIds: [],
      modelScopeRestricted: false,
      availableToolNames: [],
      projectTrusted: true,
      getCoordinatorTools: () => [],
    });
    const originalPath = process.env.PATH;
    process.env.PATH = sessionDir;

    try {
      await expect(factory.trashSessionFile(sessionFile)).resolves.toBeUndefined();
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
    expect(existsSync(sessionFile)).toBe(false);
  });
});

describe("findDeliveryEvidence", () => {
  it("recognizes keyed wait tool results and custom completion messages", () => {
    expect(
      findDeliveryEvidence(
        [
          {
            type: "message",
            message: {
              role: "toolResult",
              toolCallId: "wait",
              toolName: "subagent_wait",
              content: [],
              details: { source_agent_id: "worker", source_turn_id: "turn-1" },
              isError: false,
              timestamp: 1,
            },
          },
        ],
        "worker",
        "turn-1",
      ),
    ).toBe(true);
    expect(
      findDeliveryEvidence(
        [
          {
            type: "custom_message",
            customType: "minimal-subagents.result",
            details: { source_agent_id: "worker", source_turn_id: "turn-2" },
          },
        ],
        "worker",
        "turn-2",
      ),
    ).toBe(true);
  });
});
