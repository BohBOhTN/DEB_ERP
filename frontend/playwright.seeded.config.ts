import { defineConfig, devices } from "@playwright/test";

/// The stakeholder demo rehearsal (UI-25, AS-V2-23) against the real
/// backend and the demo seed, at the script's two widths: the presenter's
/// phone (390 px) and the projected laptop (1280 px). The backend must
/// already be running on API_URL with a freshly seeded database (see
/// `.github/workflows/ci.yml`, job "demo").
const executablePath = process.env.E2E_BROWSER;
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./e2e-seeded",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report-seeded" }],
      ]
    : "list",
  use: {
    baseURL: "http://localhost:5173",
    locale: "fr-TN",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "phone-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    env: { VITE_API_BASE_URL: "/api", API_PROXY_TARGET: apiUrl },
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
