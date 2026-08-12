import { resolve } from "node:path";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const agentDirectory = resolve(import.meta.dirname, "../..");

describe("whimsical extension discovery", () => {
  it("loads only the factory entrypoint and ignores its support modules", async () => {
    const result = await discoverAndLoadExtensions([], process.cwd(), agentDirectory);
    const whimsicalErrors = result.errors.filter(({ path }) => path.includes("whimsical"));
    const whimsicalExtensionPaths = result.extensions
      .map(({ path }) => path)
      .filter((path) => path.includes("whimsical"));

    expect(whimsicalErrors).toEqual([]);
    expect(whimsicalExtensionPaths).toEqual([resolve(agentDirectory, "extensions/whimsical.ts")]);
  });
});
