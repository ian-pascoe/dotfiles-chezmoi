import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "omp-agent",
    include: ["**/*.test.ts"],
  },
});
