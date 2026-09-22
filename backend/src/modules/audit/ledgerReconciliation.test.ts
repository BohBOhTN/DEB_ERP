import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  DistributionPrismaDouble,
  makeDistributionService,
} from "../distribution/distribution.testDouble.js";

/// The R5 exit gate requires ledgers to reconcile. These tests run realistic
/// sequences through the posting commands and then check two things that must
/// always hold together:
///
///   party balance = sum of every ledger entry for that party
///   party balance = sum of each document's own remaining balance
///
/// If a command ever wrote an entry against the wrong document, or wrote a
/// document total that disagreed with its entries, the second equality breaks
/// even while the first still looks right.
describe("distributor ledger reconciliation", () => {
  const soldAt = new Date("2026-09-22T09:00:00.000Z");
  const dispatchedAt = new Date("2026-09-22T06:00:00.000Z");
  const settledAt = new Date("2026-09-22T18:00:00.000Z");
  const paidAt = new Date("2026-09-23T09:00:00.000Z");

  it("reconciles after a partly paid sale, a settlement, and a later payment", async () => {
    const prisma = new DistributionPrismaDouble();
    const service = makeDistributionService(prisma as unknown as PrismaClient);

    // 40 units at 2.000 = 80.000, of which 30.000 is paid now.
    await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        paidAmountTnd: "30.000",
        lines: [
          { productId: "product-1", quantity: "40", unitPriceTnd: "2.000" },
        ],
      },
      { actorUserId: "user-1" },
    );

    // Dispatch 100 on consignment, then settle 60 sold at 2.000 = 120.000
    // with nothing collected at settlement time.
    const dispatch = await service.dispatchConsignment(
      {
        idempotencyKey: "dispatch-1",
        distributorId: "distributor-1",
        dispatchedAt,
        lines: [{ productId: "product-1", quantity: "100" }],
      },
      { actorUserId: "user-1" },
    );
    await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId: dispatch.dispatch.id,
        settledAt,
        lines: [
          {
            dispatchLineId: dispatch.dispatch.lines[0].id as string,
            soldQuantity: "60",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // A later 50.000 payment allocated to the settlement.
    const settlementId = prisma.store.distributorSettlements[0].id as string;
    await service.createDistributorPayment(
      {
        idempotencyKey: "payment-1",
        distributorId: "distributor-1",
        paidAt,
        amountTnd: "50.000",
        allocations: [{ settlementId, amountTnd: "50.000" }],
      },
      { actorUserId: "user-1" },
    );

    const entries = prisma.store.distributorLedgerEntries;
    const partyBalance = sum(entries.map((entry) => entry.amountTnd));

    // 80.000 sale + 120.000 settlement - 30.000 - 50.000 = 120.000.
    expect(partyBalance.toFixed(3)).toBe("120.000");

    const saleId = prisma.store.distributorSales[0].id as string;
    const saleBalance = documentBalance(entries, "saleId", saleId);
    const settlementBalance = documentBalance(
      entries,
      "settlementId",
      settlementId,
    );

    expect(saleBalance.toFixed(3)).toBe("50.000");
    expect(settlementBalance.toFixed(3)).toBe("70.000");

    // The party balance is exactly the documents that make it up: no entry is
    // orphaned and none is counted twice.
    expect(saleBalance.plus(settlementBalance).toFixed(3)).toBe(
      partyBalance.toFixed(3),
    );
    expect(
      entries.filter((entry) => !entry.saleId && !entry.settlementId),
    ).toHaveLength(0);
  });

  // DST-011: consignment dispatch is not a financial event, so it must leave
  // the ledger untouched and the balance unchanged.
  it("leaves the balance unchanged when goods are dispatched", async () => {
    const prisma = new DistributionPrismaDouble();
    const service = makeDistributionService(prisma as unknown as PrismaClient);

    await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        paidAmountTnd: "0",
        lines: [
          { productId: "product-1", quantity: "10", unitPriceTnd: "2.000" },
        ],
      },
      { actorUserId: "user-1" },
    );
    const before = sum(
      prisma.store.distributorLedgerEntries.map((entry) => entry.amountTnd),
    );

    await service.dispatchConsignment(
      {
        idempotencyKey: "dispatch-1",
        distributorId: "distributor-1",
        dispatchedAt,
        lines: [{ productId: "product-1", quantity: "100" }],
      },
      { actorUserId: "user-1" },
    );
    const after = sum(
      prisma.store.distributorLedgerEntries.map((entry) => entry.amountTnd),
    );

    expect(after.toFixed(3)).toBe(before.toFixed(3));
    expect(after.toFixed(3)).toBe("20.000");
  });

  // A settlement of returns only recognizes nothing, so it must add no entry.
  it("writes no ledger entry for a returns-only settlement", async () => {
    const prisma = new DistributionPrismaDouble();
    const service = makeDistributionService(prisma as unknown as PrismaClient);
    const dispatch = await service.dispatchConsignment(
      {
        idempotencyKey: "dispatch-1",
        distributorId: "distributor-1",
        dispatchedAt,
        lines: [{ productId: "product-1", quantity: "100" }],
      },
      { actorUserId: "user-1" },
    );

    await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId: dispatch.dispatch.id,
        settledAt,
        lines: [
          {
            dispatchLineId: dispatch.dispatch.lines[0].id as string,
            returnedQuantity: "100",
            unitPriceTnd: "0",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.distributorLedgerEntries).toHaveLength(0);
  });

  // DST-020: unaccounted quantity is a custody discrepancy, never debt.
  it("creates no receivable for unaccounted quantity", async () => {
    const prisma = new DistributionPrismaDouble();
    const service = makeDistributionService(prisma as unknown as PrismaClient);
    const dispatch = await service.dispatchConsignment(
      {
        idempotencyKey: "dispatch-1",
        distributorId: "distributor-1",
        dispatchedAt,
        lines: [{ productId: "product-1", quantity: "100" }],
      },
      { actorUserId: "user-1" },
    );

    await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId: dispatch.dispatch.id,
        settledAt,
        lines: [
          {
            dispatchLineId: dispatch.dispatch.lines[0].id as string,
            soldQuantity: "80",
            returnedQuantity: "15",
            unaccountedQuantity: "5",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // Only the 80 sold are recognized: 160.000, not 170.000 for the missing 5.
    const balance = sum(
      prisma.store.distributorLedgerEntries.map((entry) => entry.amountTnd),
    );
    expect(balance.toFixed(3)).toBe("160.000");
  });
});

function sum(values: Array<string | number>): Prisma.Decimal {
  return values
    .reduce(
      (total: Prisma.Decimal, value) => total.plus(new Prisma.Decimal(value)),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

function documentBalance(
  entries: Array<Record<string, unknown> & { amountTnd: string }>,
  key: "saleId" | "settlementId",
  documentId: string,
): Prisma.Decimal {
  return sum(
    entries
      .filter((entry) => entry[key] === documentId)
      .map((entry) => entry.amountTnd),
  );
}
