import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CustomersService } from "../modules/customers/customers.service.js";
import { DistributionService } from "../modules/distribution/distribution.service.js";
import { ExpensesService } from "../modules/expenses/expenses.service.js";
import { PosService } from "../modules/pos/pos.service.js";
import { ProcurementService } from "../modules/procurement/procurement.service.js";
import {
  cleanUpPerformanceFixture,
  seedPerformanceFixture,
  type PerformanceFixture,
} from "./fixture.js";

/// AS-V2-04 and AS-V2-06: the screens the bakery uses most stay fast as
/// history grows, and product search finds accented names through the
/// trigram index. Only PostgreSQL can prove either, so this suite is gated
/// exactly like the concurrency suites and runs in CI.
///
/// Point INTEGRATION_DATABASE_URL at a throwaway database. Never the shared
/// remote development database: this suite writes and deletes rows.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (process.env.REQUIRE_INTEGRATION_TESTS && !integrationDatabaseUrl) {
  throw new Error(
    "REQUIRE_INTEGRATION_TESTS is set but INTEGRATION_DATABASE_URL is missing.",
  );
}

/// The budget is p95 over repeated calls. CI runners are slower than a
/// laptop, so the ceiling is configurable; the default is the sprint gate.
const budgetMs = Number(process.env.INTEGRATION_LATENCY_BUDGET_MS ?? 150);
const samples = 20;
const runId = Math.random().toString(36).slice(2, 10);
const suite = integrationDatabaseUrl ? describe : describe.skip;

async function p95(run: () => Promise<unknown>): Promise<number> {
  // One warm-up call so connection setup and plan caching are not measured.
  await run();
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = process.hrtime.bigint();
    await run();
    durations.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }
  durations.sort((left, right) => left - right);
  return durations[Math.min(durations.length - 1, Math.floor(samples * 0.95))];
}

suite("query performance on a large history", () => {
  let prisma: PrismaClient;
  let fixture: PerformanceFixture;
  let customers: CustomersService;
  let procurement: ProcurementService;
  let distribution: DistributionService;
  let expenses: ExpensesService;
  let pos: PosService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: integrationDatabaseUrl as string } },
    });
    fixture = await seedPerformanceFixture(prisma, runId);
    console.info(`[performance] fixture seeded (${runId})`);
    customers = new CustomersService(prisma);
    procurement = new ProcurementService(prisma);
    distribution = new DistributionService(prisma);
    expenses = new ExpensesService(prisma);
    pos = new PosService(prisma);
  }, 300_000);

  afterAll(async () => {
    if (prisma) {
      await cleanUpPerformanceFixture(prisma, fixture);
      await prisma.$disconnect();
    }
  }, 120_000);

  it("reconciles SQL balances with the ledger rows", async () => {
    console.info("[performance] reconciling");
    const customerId = fixture.customers[0].id;
    const page = await customers.listCustomerBalances({
      search: `Client 0 ${runId}`,
      page: 1,
      pageSize: 5,
    });
    const row = page.items.find((item) => item.customer.id === customerId);
    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId, balanceKind: "RECEIVABLE" },
    });
    const expected = entries
      .reduce((sum, entry) => sum.plus(entry.amountTnd), new Prisma.Decimal(0))
      .toFixed(3);

    expect(row?.balanceTnd).toBe(expected);
    expect(row?.openSaleCount).toBeGreaterThan(0);

    // Each fixture supplier has 40 ledger rows, so a page of 10 must leave a
    // cursor behind.
    const supplierId = fixture.suppliers[0].id;
    const statement = await procurement.getSupplierStatement(supplierId, {
      limit: 10,
    });
    const supplierEntries = await prisma.supplierLedgerEntry.findMany({
      where: { supplierId },
    });
    expect(statement.balanceTnd).toBe(
      supplierEntries
        .reduce(
          (sum, entry) => sum.plus(entry.amountTnd),
          new Prisma.Decimal(0),
        )
        .toFixed(3),
    );
    expect(statement.meta.nextCursor).not.toBeNull();
  }, 60_000);

  it("pages a statement by cursor without repeating or skipping entries", async () => {
    console.info("[performance] paging statement");
    const customerId = fixture.customers[1].id;
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    do {
      const statement = await customers.getCustomerStatement(customerId, {
        cursor,
        limit: 10,
      });
      for (const entry of statement.ledgerEntries) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
      cursor = statement.meta.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 100);

    const total = await prisma.customerLedgerEntry.count({
      where: { customerId },
    });
    expect(seen.size).toBe(total);
  }, 60_000);

  it("keeps the busiest reads within the latency budget", async () => {
    console.info("[performance] measuring");
    const timings = {
      customerBalances: await p95(() =>
        customers.listCustomerBalances({ page: 1, pageSize: 25 }),
      ),
      customerBalancesByBalance: await p95(() =>
        customers.listCustomerBalances({
          page: 1,
          pageSize: 25,
          sort: "balance",
        }),
      ),
      customerStatement: await p95(() =>
        customers.getCustomerStatement(fixture.customers[2].id),
      ),
      supplierBalances: await p95(() =>
        procurement.listSupplierBalances({ page: 1, pageSize: 25 }),
      ),
      supplierStatement: await p95(() =>
        procurement.getSupplierStatement(fixture.suppliers[1].id),
      ),
      distributorBalances: await p95(() =>
        distribution.listDistributorBalances({ page: 1, pageSize: 25 }),
      ),
      distributorStatement: await p95(() =>
        distribution.getDistributorStatement(fixture.distributors[0].id),
      ),
      custody: await p95(() => distribution.listCustody({})),
      expenseTotals: await p95(() => expenses.getExpenseTotals({})),
      productSearch: await p95(() =>
        pos.listProducts({ search: "the", page: 1, pageSize: 25 }),
      ),
    };

    // Reported in the CI log as evidence for the sprint brief.
    console.info(
      `[performance] p95 ms over ${samples} samples: ${JSON.stringify(timings)}`,
    );

    for (const [name, duration] of Object.entries(timings)) {
      expect(duration, `${name} p95`).toBeLessThanOrEqual(budgetMs);
    }
  }, 300_000);

  // AS-V2-06: an unaccented search finds the accented product, and the plan
  // is printed so the trigram index usage can be checked in the CI log.
  it("finds an accented product from an unaccented search", async () => {
    const result = await pos.listProducts({
      search: "the a la menthe",
      page: 1,
      pageSize: 10,
    });

    expect(result.items.map((item) => item.name)).toContain(
      `Thé à la menthe ${runId}`,
    );

    console.info("[performance] explaining product search");
    const plan = await prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT id FROM "products"
      WHERE "is_active" = true AND "normalized_name" LIKE ${"%the a la menthe%"}
      ORDER BY "name" ASC LIMIT 25
    `;
    console.info(
      `[performance] product search plan:\n${plan
        .map((row) => row["QUERY PLAN"])
        .join("\n")}`,
    );
  }, 60_000);
});
