import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { mockApi, ownerPermissions } from "../e2e/mockApi.js";

/// Responsive check (09 section A): opens the login page, the home page and
/// the module screens at the four review widths against the dev server and
/// the browser-side API mock, and fails on any horizontal page scroll. No
/// images are written: the assertions are the evidence (owner decision).
/// Runs through `tsx`; `E2E_BROWSER` points at a system Chromium when needed.
const frontendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const port = Number(process.env.SCREEN_PORT ?? 5175);
const widths = [360, 430, 768, 1280];
const screens = [
  { name: "connexion", path: "/connexion", signedIn: false, ready: "heading" },
  { name: "accueil", path: "/", signedIn: true, ready: "heading" },
  { name: "produits", path: "/produits", signedIn: true, ready: "heading" },
  {
    name: "matieres-premieres",
    path: "/matieres-premieres",
    signedIn: true,
    ready: "heading",
  },
  {
    name: "catalogue-parametres",
    path: "/catalogue/parametres",
    signedIn: true,
    ready: "heading",
  },
  { name: "stock", path: "/stock", signedIn: true, ready: "heading" },
  {
    name: "stock-mouvements",
    path: "/stock/mouvements",
    signedIn: true,
    ready: "heading",
  },
  {
    name: "fournisseurs",
    path: "/fournisseurs",
    signedIn: true,
    ready: "heading",
  },
  { name: "achats", path: "/achats", signedIn: true, ready: "heading" },
  {
    name: "achat-nouveau",
    path: "/achats/nouveau",
    signedIn: true,
    ready: "heading",
  },
  {
    name: "paiements-fournisseurs",
    path: "/paiements-fournisseurs",
    signedIn: true,
    ready: "heading",
  },
  { name: "clients", path: "/clients", signedIn: true, ready: "heading" },
  { name: "commandes", path: "/commandes", signedIn: true, ready: "heading" },
  {
    name: "commande-nouvelle",
    path: "/commandes/nouvelle",
    signedIn: true,
    ready: "heading",
  },
  { name: "caisse-v1", path: "/caisse", signedIn: true, ready: "legacy" },
];

const server = spawn(
  "npm",
  ["run", "dev", "--", "--port", String(port), "--strictPort"],
  {
    cwd: frontendDir,
    env: { ...process.env, VITE_API_BASE_URL: "/api" },
    stdio: "ignore",
  },
);
await waitForServer(`http://localhost:${port}/`);

const browser = await chromium.launch(
  process.env.E2E_BROWSER ? { executablePath: process.env.E2E_BROWSER } : {},
);
const failures = [];

for (const width of widths) {
  for (const screen of screens) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      locale: "fr-TN",
      timezoneId: "Africa/Tunis",
    });
    await mockApi(page, {
      signedIn: screen.signedIn,
      permissions: ownerPermissions,
    });
    await page.goto(`http://localhost:${port}${screen.path}`);
    if (screen.ready === "legacy") {
      await page.getByText("Ancienne interface").waitFor();
    } else {
      await page.getByRole("heading", { level: 1 }).first().waitFor();
    }
    await page.waitForTimeout(400);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    if (overflow > 0) {
      failures.push(`${screen.name} at ${width}px overflows by ${overflow}px`);
    }

    console.log(`${screen.name} ${width}px: overflow ${overflow}px`);
    await page.close();
  }
}

await browser.close();
server.kill();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Responsive check passed at 360, 430, 768 and 1280 px.");

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Dev server did not start at ${url}`);
}
