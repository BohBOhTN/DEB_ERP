import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../openapi/document.js";

/// Writes `backend/openapi.json` from the operation catalogue, or with
/// `--check` fails when the committed file no longer matches, so CI refuses a
/// route change whose contract was not regenerated.
const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../openapi.json",
);
const rendered = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const committed = fs.existsSync(target)
    ? fs.readFileSync(target, "utf8")
    : "";

  if (committed !== rendered) {
    console.error(
      "openapi.json is stale. Run `npm run openapi:generate --workspace backend` and commit the result.",
    );
    process.exit(1);
  }

  console.log("openapi.json is up to date.");
} else {
  fs.writeFileSync(target, rendered);
  console.log(`Wrote ${path.relative(process.cwd(), target)}.`);
}
