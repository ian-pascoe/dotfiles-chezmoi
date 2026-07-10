import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./dot_config/opencode", "./dot_pi/agent", "./tests"],
  },
});
