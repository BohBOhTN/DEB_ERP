import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { describeError, errorCopyFor, knownErrorCodes } from "./errors.js";

/// Every code the backend can emit must have French copy, so an unknown code
/// can only come from a route added after this test was written.
function backendErrorCodes(): string[] {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../backend/src",
  );
  const codes = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts")
      ) {
        for (const match of fs
          .readFileSync(full, "utf8")
          .matchAll(/code: "([A-Z_]+)"/g)) {
          codes.add(match[1] as string);
        }
      }
    }
  };
  walk(root);

  return [...codes].sort();
}

describe("error copy", () => {
  it("covers every error code the backend emits", () => {
    const known = new Set(knownErrorCodes());
    const missing = backendErrorCodes().filter((code) => !known.has(code));

    expect(missing).toEqual([]);
  });

  it("prefers the backend message as the description", () => {
    expect(
      describeError({
        code: "CUSTOMER_NOT_FOUND",
        message: "Client introuvable.",
      }),
    ).toEqual({
      title: "Client introuvable",
      description: "Client introuvable.",
    });
    expect(
      describeError({ code: "CUSTOMER_NOT_FOUND", message: "" }).description,
    ).toBe("Ce client n'existe pas.");
  });

  it("falls back to generic copy for unknown errors", () => {
    expect(errorCopyFor("SOMETHING_NEW").title).toBe("Une erreur est survenue");
    expect(describeError(new TypeError("boom")).title).toBe(
      "Une erreur est survenue",
    );
    expect(
      describeError({ code: "NETWORK_ERROR", message: "Failed to fetch" })
        .title,
    ).toBe("Connexion impossible");
  });
});
