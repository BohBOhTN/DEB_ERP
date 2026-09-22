import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

/// AS-V2-10: opens the component gallery at the four review widths, fails on
/// any horizontal page scroll, exercises the dialogs' focus trap, and writes
/// one screenshot per width. Needs the dev server (`npm run dev`) and a
/// Chromium from `npx playwright install chromium`.
const baseUrl = process.env.KIT_URL ?? "http://localhost:5173/_kit?embed=1";
const outDir =
  process.env.KIT_OUT ??
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../kit-screenshots",
  );
const widths = [360, 430, 768, 1280];
const sectionShots = (
  process.env.KIT_SECTIONS ??
  "Button,FormField,DataTable,KpiTile,AppShell,ConfirmDialog"
).split(",");

fs.mkdirSync(outDir, { recursive: true });
// A system Chromium (Brave, Chrome) can stand in for the Playwright build
// on machines Playwright no longer downloads for.
const browser = await chromium.launch(
  process.env.KIT_BROWSER ? { executablePath: process.env.KIT_BROWSER } : {},
);
const failures = [];

for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: "fr-TN",
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("section[id^='kit-']");

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    sections: document.querySelectorAll("section[id^='kit-']").length,
    focusRing: getComputedStyle(document.documentElement)
      .getPropertyValue("--focus-ring")
      .trim(),
  }));

  if (metrics.scrollWidth > metrics.clientWidth) {
    const offenders = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      const seen = new Set();
      return [...document.querySelectorAll("body *")]
        .map((element) => ({
          element,
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .filter(({ element, right }) => {
          if (right <= limit + 1) return false;
          // Content inside a scroll container is clipped, not a page overflow.
          for (
            let node = element.parentElement;
            node && node !== document.body;
            node = node.parentElement
          ) {
            const overflow = getComputedStyle(node).overflowX;
            if (
              overflow === "auto" ||
              overflow === "scroll" ||
              overflow === "hidden"
            )
              return false;
          }
          return true;
        })
        .sort((a, b) => b.right - a.right)
        .filter(({ element }) => {
          const key = `${element.tagName}.${String(element.className).split(" ")[0]}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8)
        .map(({ element, right }) => {
          const section = element.closest("section[id^=kit-]")?.id ?? "gallery";
          return `${section} > ${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]} (${right}px)`;
        });
    });
    failures.push(
      `${width}px: horizontal scroll (${metrics.scrollWidth} > ${metrics.clientWidth}); offenders: ${offenders.join(", ")}`,
    );
  }

  // Focus trap: open the first Dialog example and tab through it.
  const opener = page.getByRole("button", { name: /^Ouvrir \(sm\)/ });
  if (await opener.count()) {
    await opener.first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() =>
        Boolean(document.activeElement?.closest("[role='dialog']")),
      );
      if (!inside) {
        failures.push(
          `${width}px: focus left the dialog after ${step + 1} tabs`,
        );
        break;
      }
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
  }

  await page.screenshot({
    path: path.join(outDir, `kit-${width}.png`),
    fullPage: true,
  });

  // Section crops for the PR brief (full pages are 30 000 px tall).
  if (width === 360 || width === 1280) {
    for (const name of sectionShots) {
      const section = page.locator(`#kit-${name}`);
      if (await section.count()) {
        await section.screenshot({
          path: path.join(outDir, `section-${name}-${width}.png`),
        });
      }
    }
  }
  console.log(
    `${width}px: ${metrics.sections} components, page width ${metrics.scrollWidth}/${metrics.clientWidth}, focus ring ${metrics.focusRing ? "set" : "MISSING"}`,
  );
  await page.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Screenshots written to ${outDir}`);
