import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

/// Bundle budget (06 section 4): initial JavaScript at most 250 kB gzip,
/// the POS route chunk at most 120 kB gzip on top. Reads `dist/` after
/// `vite build` and fails the build when a budget is exceeded.
const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const budgets = {
  initialGzipBytes: 250 * 1024,
  posRouteGzipBytes: 120 * 1024,
};

if (!fs.existsSync(distDir)) {
  console.error("dist/ is missing; run `vite build` first.");
  process.exit(1);
}

const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
const initialScripts = [
  ...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g),
].map((match) => match[1]);
const modulePreloads = [
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g),
].map((match) => match[1]);
const initialFiles = [...new Set([...initialScripts, ...modulePreloads])];

const gzipSize = (file) =>
  zlib.gzipSync(fs.readFileSync(path.join(distDir, file))).length;
const rows = initialFiles.map((file) => ({ file, gzip: gzipSize(file) }));
const initialTotal = rows.reduce((sum, row) => sum + row.gzip, 0);

const posChunks = fs
  .readdirSync(path.join(distDir, "assets"))
  .filter((name) => /^pos[-.].*\.js$/i.test(name))
  .map((name) => ({
    file: `assets/${name}`,
    gzip: gzipSize(`assets/${name}`),
  }));
const posTotal = posChunks.reduce((sum, row) => sum + row.gzip, 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

console.log("Initial JavaScript (gzip):");
for (const row of rows) {
  console.log(`  ${row.file}  ${kb(row.gzip)}`);
}
console.log(
  `  total ${kb(initialTotal)} / budget ${kb(budgets.initialGzipBytes)}`,
);
console.log(
  `POS route (gzip): ${kb(posTotal)} / budget ${kb(budgets.posRouteGzipBytes)}`,
);

let failed = false;

if (initialTotal > budgets.initialGzipBytes) {
  console.error("Initial bundle exceeds its budget.");
  failed = true;
}

if (posTotal > budgets.posRouteGzipBytes) {
  console.error("POS route chunk exceeds its budget.");
  failed = true;
}

process.exit(failed ? 1 : 0);
