import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

/// UI-24: Lighthouse on the phone profile against a served build with the
/// real API behind it. Public routes run anonymously; the others carry the
/// session cookie of a login done here. Thresholds: accessibility >= 95,
/// performance >= 80 (R10 gate). Usage:
///   API_URL=http://localhost:4000 APP_URL=http://localhost:4173 \
///   node scripts/lighthouse.mjs [--routes /connexion,/]
const appUrl = process.env.APP_URL ?? "http://localhost:4173";
const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const email = process.env.LH_EMAIL ?? "proprietaire@demo.tn";
const password = process.env.LH_PASSWORD ?? "Demo2026!";
const minAccessibility = Number(process.env.LH_MIN_A11Y ?? 95);
const minPerformance = Number(process.env.LH_MIN_PERF ?? 80);
const args = process.argv.slice(2);
const routesArg = args.indexOf("--routes");
const routes =
  routesArg >= 0
    ? args[routesArg + 1].split(",")
    : [
        "/connexion",
        "/",
        "/caisse",
        "/commandes",
        "/clients",
        "/achats",
        "/produits",
        "/stock",
        "/roles",
        "/audit",
      ];

async function login() {
  const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(
      `login failed: ${response.status} ${await response.text()}`,
    );
  }
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("login answered without a session cookie");
  return cookie.split(";")[0];
}

const chrome = await launch({
  chromePath: process.env.E2E_BROWSER,
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});
const failures = [];
try {
  const cookie = routes.some((route) => route !== "/connexion")
    ? await login()
    : null;
  for (const route of routes) {
    const anonymous = route === "/connexion";
    const result = await lighthouse(`${appUrl}${route}`, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices"],
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        disabled: false,
      },
      throttlingMethod: "simulate",
      extraHeaders: anonymous || !cookie ? {} : { Cookie: cookie },
      locale: "fr",
    });
    const scores = Object.fromEntries(
      Object.entries(result.lhr.categories).map(([id, category]) => [
        id,
        Math.round((category.score ?? 0) * 100),
      ]),
    );
    const line = `${route}: performance ${scores.performance}, accessibility ${scores.accessibility}, best-practices ${scores["best-practices"]}`;
    console.log(line);
    if (scores.accessibility < minAccessibility)
      failures.push(
        `${route}: accessibility ${scores.accessibility} < ${minAccessibility}`,
      );
    if (scores.performance < minPerformance)
      failures.push(
        `${route}: performance ${scores.performance} < ${minPerformance}`,
      );
  }
} finally {
  await chrome.kill();
}
if (failures.length > 0) {
  console.error(`Lighthouse thresholds missed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Lighthouse thresholds met on every route.");
