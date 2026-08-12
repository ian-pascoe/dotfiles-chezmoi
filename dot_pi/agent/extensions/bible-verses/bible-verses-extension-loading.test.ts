import { resolve } from "node:path";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const agentDirectory = resolve(import.meta.dirname, "../..");

describe("Bible verses extension discovery", () => {
  it("loads only the factory entrypoint and ignores its support modules", async () => {
    const result = await discoverAndLoadExtensions([], process.cwd(), agentDirectory);
    const bibleVerseErrors = result.errors.filter(({ path }) => path.includes("bible-verses"));
    const bibleVerseExtensionPaths = result.extensions
      .map(({ path }) => path)
      .filter((path) => path.includes("bible-verses"));

    expect(bibleVerseErrors).toEqual([]);
    expect(bibleVerseExtensionPaths).toEqual([
      resolve(agentDirectory, "extensions/bible-verses/index.ts"),
    ]);
  });
});
