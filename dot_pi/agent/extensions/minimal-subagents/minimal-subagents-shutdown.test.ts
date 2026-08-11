import { describe, expect, it, vi } from "vitest";
import { shutdownMinimalSubagentsSession } from "./minimal-subagents-shutdown.js";

describe("shutdownMinimalSubagentsSession", () => {
  it("drains coordinator and root work before a reload shutdown", async () => {
    const events: string[] = [];
    let rootIdle = false;
    const coordinator = {
      waitForSettledOperations: vi.fn(async () => {
        events.push("coordinator settled");
      }),
      shutdownAfterSettling: vi.fn(async () => {
        events.push("graceful shutdown");
      }),
      shutdown: vi.fn(async () => {
        events.push("canceling shutdown");
      }),
    };

    await shutdownMinimalSubagentsSession("reload", coordinator, {
      isRootIdle: () => rootIdle,
      waitForRootIdle: async () => {
        events.push("root settled");
        rootIdle = true;
      },
    });

    expect(events).toEqual([
      "coordinator settled",
      "root settled",
      "coordinator settled",
      "graceful shutdown",
    ]);
    expect(coordinator.shutdown).not.toHaveBeenCalled();
  });

  it("keeps cancellation semantics for non-reload shutdown", async () => {
    const coordinator = {
      waitForSettledOperations: vi.fn(),
      shutdownAfterSettling: vi.fn(),
      shutdown: vi.fn(async () => undefined),
    };

    await shutdownMinimalSubagentsSession("exit", coordinator, {
      isRootIdle: () => false,
      waitForRootIdle: vi.fn(),
    });

    expect(coordinator.shutdown).toHaveBeenCalledOnce();
    expect(coordinator.waitForSettledOperations).not.toHaveBeenCalled();
    expect(coordinator.shutdownAfterSettling).not.toHaveBeenCalled();
  });
});
