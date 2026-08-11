import { describe, expect, it } from "vitest";
import { rememberForkSnapshot, takeForkSnapshot } from "./minimal-subagents-fork-lifecycle.js";
import type { ForkSnapshot } from "./minimal-subagents-types.js";

describe("fork snapshot handoff", () => {
  it("survives extension instance replacement and is consumed exactly once", () => {
    const snapshot: ForkSnapshot = {
      source_root_session_file: "/sessions/jsonl",
      agents: [],
      tombstones: ["deleted"],
      deliveries: [],
    };
    rememberForkSnapshot(snapshot);
    expect(takeForkSnapshot("/sessions/jsonl")).toEqual(snapshot);
    expect(takeForkSnapshot("/sessions/jsonl")).toBeUndefined();
  });
});
