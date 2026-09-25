import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextPurchaseReference, nextSaleReference } from "./references.js";

/// AS-V2-09: document numbers come from PostgreSQL sequences, so twenty
/// concurrent posts receive twenty distinct `VT-` / `AC-` references. Only
/// the database can prove it; the unit tests use a counter double.
///
/// Point INTEGRATION_DATABASE_URL at a throwaway database. Never the shared
/// remote development database.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (process.env.REQUIRE_INTEGRATION_TESTS && !integrationDatabaseUrl) {
  throw new Error(
    "REQUIRE_INTEGRATION_TESTS is set but INTEGRATION_DATABASE_URL is missing.",
  );
}

const concurrentPosts = 20;
const suite = integrationDatabaseUrl ? describe : describe.skip;

suite("document references under concurrency", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: { db: { url: integrationDatabaseUrl as string } },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("hands out distinct, well-formed sale and purchase references", async () => {
    const [sales, purchases] = await Promise.all([
      Promise.all(
        Array.from({ length: concurrentPosts }, () =>
          nextSaleReference(prisma),
        ),
      ),
      Promise.all(
        Array.from({ length: concurrentPosts }, () =>
          nextPurchaseReference(prisma),
        ),
      ),
    ]);

    expect(new Set(sales).size).toBe(concurrentPosts);
    expect(new Set(purchases).size).toBe(concurrentPosts);
    for (const reference of sales) {
      expect(reference).toMatch(/^VT-\d{6}$/);
    }
    for (const reference of purchases) {
      expect(reference).toMatch(/^AC-\d{6}$/);
    }
  });
});
