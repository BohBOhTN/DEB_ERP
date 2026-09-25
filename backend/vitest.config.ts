import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // The performance suite seeds a large history and runs through its own
    // config (vitest.integration.config.ts) as a separate CI step.
    exclude: ["**/node_modules/**", "src/integration/**"],
  },
});
