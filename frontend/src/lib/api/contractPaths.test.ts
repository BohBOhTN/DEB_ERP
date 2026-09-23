import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/// Every path a feature client calls must exist in the generated OpenAPI
/// document, so a client can never target a route the server does not
/// mount (the mounts differ per module: `/procurement/...` but
/// `/customers`, `/orders`, `/distributors`).
const here = path.dirname(fileURLToPath(import.meta.url));
const featuresDir = path.resolve(here, "../../features");
const openapi = JSON.parse(
  fs.readFileSync(
    path.resolve(here, "../../../../backend/openapi.json"),
    "utf8",
  ),
) as { paths: Record<string, unknown> };

const documented = Object.keys(openapi.paths).map(
  (route) =>
    new RegExp(
      `^${route.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+")}$`,
    ),
);

function apiFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return apiFiles(full);
    return /\.api\.ts$/.test(entry.name) ? [full] : [];
  });
}

function calledPaths(source: string): string[] {
  const paths: string[] = [];
  // apiClient.<verb>(<generic>)("<path>" | `<path>`)
  const call =
    /apiClient\.(?:list|get|post|patch|put|delete)(?:<[^(]*>)?\(\s*(["'`])([^"'`]+)\1/g;
  for (const match of source.matchAll(call)) {
    paths.push(match[2]!.replace(/\$\{[^}]+\}/g, "x").replace(/\?.*$/, ""));
  }
  return paths;
}

describe("API contract paths", () => {
  it("calls only routes the OpenAPI document declares", () => {
    const files = apiFiles(featuresDir);
    expect(files.length).toBeGreaterThan(5);
    const undeclared: string[] = [];
    for (const file of files) {
      for (const route of calledPaths(fs.readFileSync(file, "utf8"))) {
        if (!documented.some((pattern) => pattern.test(route))) {
          undeclared.push(`${path.relative(featuresDir, file)}: ${route}`);
        }
      }
    }
    expect(undeclared).toEqual([]);
  });
});
