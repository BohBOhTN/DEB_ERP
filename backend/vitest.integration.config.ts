import { defineConfig } from "vitest/config";

/// The performance suite against a real PostgreSQL. Runs in one process so a
/// crash or a slow query is reported on its own, with verbose output for the
/// evidence lines the sprint brief needs.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/integration/**/*.test.ts"],
    reporters: ["verbose"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
