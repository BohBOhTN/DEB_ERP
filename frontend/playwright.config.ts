import { defineConfig, devices } from "@playwright/test";

/// Smoke flows at phone and desktop widths against the Vite dev server with
/// the API mocked in the browser (06 section 4). `E2E_BROWSER` points at a
/// system Chromium on machines Playwright cannot download for.
const executablePath = process.env.E2E_BROWSER;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    locale: "fr-TN",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "phone-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
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
    // Same-origin API so the browser sends no CORS preflight to the mock.
    env: { VITE_API_BASE_URL: "/api" },
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
