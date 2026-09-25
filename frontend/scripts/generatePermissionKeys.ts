import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { permissionCatalog } from "../../backend/src/modules/access/permissions.js";

/// Writes the `PermissionKey` union from the backend catalogue so the
/// frontend can never reference a key the server does not know. Run with
/// `npm run api:permissions`; CI fails when the committed file is stale.
const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/auth/permissionKeys.gen.ts",
);
const keys = permissionCatalog.map((item) => item.key);
const modules = [...new Set(permissionCatalog.map((item) => item.module))];
const rendered = `// Generated from backend/src/modules/access/permissions.ts by
// scripts/generatePermissionKeys.ts. Do not edit by hand.

export const permissionKeys = [
${keys.map((key) => `  "${key}",`).join("\n")}
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const permissionModules = [
${modules.map((module) => `  "${module}",`).join("\n")}
] as const;
`;

fs.writeFileSync(target, rendered);
console.log(
  `Wrote ${path.relative(process.cwd(), target)} (${keys.length} keys).`,
);
