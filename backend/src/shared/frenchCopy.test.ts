import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/// The language rule requires proper French, and ASCII-only French ("cle",
/// "quantite", "reglement") reads as a typo on every screen. This test scans
/// the user-facing string literals in the backend sources for the words that
/// were most often written without their accent, so the mistake cannot creep
/// back in through a new error message.
const sourceRoot = join(import.meta.dirname, "..");

const tellTaleWords = [
  "cle",
  "deja",
  "ete",
  "reessayer",
  "reessayez",
  "donnees",
  "quantite",
  "etre",
  "superieure",
  "superieur",
  "zero",
  "matiere",
  "element",
  "elements",
  "caracteres",
  "depasser",
  "autorisee",
  "categorie",
  "unite",
  "reglement",
  "depense",
  "echeance",
  "operation",
  "modifie",
  "modifiee",
  "paye",
  "regle",
  "confirme",
  "validee",
  "annulee",
  "terminee",
  "prete",
  "acces",
  "necessaire",
  "desactive",
  "cree",
  "connecte",
];

const tellTalePattern = new RegExp(
  `(?<![A-Za-zÀ-ÿ_])(${tellTaleWords.join("|")})(?![A-Za-zÀ-ÿ_])`,
);

/// Only literals that look like sentences: they contain a space and a
/// lowercase letter. Identifiers, keys, and paths are skipped.
const literalPattern = /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listSourceFiles(path);
    }
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("French copy", () => {
  it("uses accents in every user-facing message", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(sourceRoot)) {
      // Comments are engineering English and may quote anything.
      const source = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
      for (const match of source.matchAll(literalPattern)) {
        const literal = match[1] ?? match[2] ?? "";
        if (!/\s/.test(literal) || !/[a-z]/.test(literal)) {
          continue;
        }
        if (tellTalePattern.test(literal)) {
          offenders.push(`${file.replace(sourceRoot, "src")}: "${literal}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
