import react from "@vitejs/plugin-react";
import prefixSelector from "postcss-prefix-selector";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

/// Vendor code is split from the application so a change to a screen does
/// not invalidate the framework chunk in the browser cache, and the POS
/// route stays within its own budget (06 section 1). The bundle report is a
/// CI artefact read by `scripts/check-bundle-size.mjs`.
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: "dist/bundle-report.html",
      template: "treemap",
      gzipSize: true,
      open: false,
    }),
  ],
  server: {
    port: 5173,
  },
  css: {
    postcss: {
      plugins: [
        // The V1 stylesheet styles bare elements (`button`, `input`, `h1`...).
        // Until Sprint 26 deletes it, it is scoped to the `.legacy-screen`
        // wrapper so a mounted V1 screen cannot restyle the V2 shell
        // (ADR-V2-003). The file itself stays untouched.
        prefixSelector({
          prefix: ".legacy-screen",
          includeFiles: [/src\/styles\/global\.css$/],
          transform(prefix, selector, prefixedSelector) {
            if (selector === "body" || selector === ":root") {
              return prefix;
            }

            if (selector === "*") {
              return `${prefix} *`;
            }

            return prefixedSelector;
          },
        }),
      ],
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query", "@tanstack/react-table"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          radix: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-switch",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-toast",
            "@radix-ui/react-visually-hidden",
            "cmdk",
          ],
          dates: ["date-fns", "date-fns-tz", "decimal.js-light"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Playwright specs run with `npm run e2e`, not with Vitest.
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    css: true,
  },
});
