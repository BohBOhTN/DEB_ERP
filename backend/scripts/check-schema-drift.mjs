#!/usr/bin/env node
// Schema drift guard (BE-24).
//
// Compares the migrated database with prisma/schema.prisma. Prisma cannot
// express the partial unique indexes and sequences the hand-written
// migrations create, so a diff always proposes dropping them; those exact
// statements are allowed through prisma/protected-objects.json. Any other
// difference means the schema and the migrations have drifted apart, and the
// next `prisma migrate dev` would generate a destructive migration.
//
// Usage: DATABASE_URL=... node scripts/check-schema-drift.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const protectedObjects = JSON.parse(
  readFileSync(join(root, "prisma", "protected-objects.json"), "utf8"),
);
const allowedDrops = new Set([
  ...protectedObjects.partialUniqueIndexes,
  ...protectedObjects.sequences,
]);

let diff;
try {
  diff = execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-url",
      databaseUrl,
      "--to-schema-datamodel",
      join(root, "prisma", "schema.prisma"),
      "--script",
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (error) {
  console.error(error.stderr ?? error.message);
  process.exit(2);
}

const statements = diff
  .split(/;\s*\n/)
  .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

const unexpected = [];
for (const statement of statements) {
  const dropIndex = /^DROP INDEX(?: IF EXISTS)? "?([\w]+)"?/i.exec(statement);
  const dropSequence = /^DROP SEQUENCE(?: IF EXISTS)? "?([\w]+)"?/i.exec(
    statement,
  );
  const name = dropIndex?.[1] ?? dropSequence?.[1];

  if (name && allowedDrops.has(name)) {
    continue;
  }

  unexpected.push(statement);
}

if (unexpected.length === 0) {
  console.log(
    `Schema drift check passed (${statements.length} protected statement(s) allowed).`,
  );
  process.exit(0);
}

console.error(
  "Schema drift detected. The migrated database differs from prisma/schema.prisma:\n",
);
for (const statement of unexpected) {
  console.error(`  ${statement};`);
}
console.error(
  "\nEither add a reviewed migration, fix the schema, or, for an object Prisma cannot express, list it in prisma/protected-objects.json.",
);
process.exit(1);
