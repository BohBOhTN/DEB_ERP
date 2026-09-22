import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { DistributionService } from "./distribution.service.js";
import {
  DistributionPrismaDouble,
  makeDistributionService,
} from "./distribution.testDouble.js";

const soldAt = new Date("2026-09-22T09:00:00.000Z");
const paidAt = new Date("2026-09-23T09:00:00.000Z");

describe("DistributionService distributor payments", () => {
  // AS-016 and DST-026: a later payment reduces the receivable, leaves custody
  // untouched, and recognizes no revenue again.
  it("reduces the receivable without touching custody or revenue", async () => {
    const { service, prisma } = await makeServiceWithUnpaidSale();
    const movementsBefore = prisma.store.inventoryMovements.length;

    const result = await service.createDistributorPayment(
      {
        idempotencyKey: "payment-1",
        distributorId: "distributor-1",
        paidAt,
        amountTnd: "30.000",
      },
      { actorUserId: "user-1" },
    );

    expect(result.payment).toMatchObject({
      distributorId: "distributor-1",
      amountTnd: "30.000",
    });

    const balance = prisma.store.distributorLedgerEntries.reduce(
      (total, entry) => total + Number(entry.amountTnd),
      0,
    );
    // 80 receivable less a 30 payment.
    expect(balance).toBe(50);
    expect(prisma.store.distributorLedgerEntries.at(-1)).toMatchObject({
      entryType: "PAYMENT",
      amountTnd: "-30.000",
    });
    // Payment never moves stock or custody.
    expect(prisma.store.inventoryMovements).toHaveLength(movementsBefore);
    expect(prisma.store.distributorDispatchLines).toHaveLength(0);
  });

  it("allocates a payment to a specific direct sale", async () => {
    const { service, prisma } = await makeServiceWithUnpaidSale();
    const saleId = prisma.store.distributorSales[0].id as string;

    const result = await service.createDistributorPayment(
      {
        idempotencyKey: "payment-1",
        distributorId: "distributor-1",
        paidAt,
        amountTnd: "20.000",
        allocations: [{ saleId, amountTnd: "20.000" }],
      },
      { actorUserId: "user-1" },
    );

    expect(result.allocations).toEqual([
      { saleId, settlementId: undefined, amountTnd: "20.000" },
    ]);
    expect(prisma.store.distributorLedgerEntries.at(-1)).toMatchObject({
      entryType: "PAYMENT",
      saleId,
      amountTnd: "-20.000",
    });
  });

  it("rejects an allocation above the document balance", async () => {
    const { service, prisma } = await makeServiceWithUnpaidSale();
    // A second unpaid sale lifts the distributor balance to 160.000, so the
    // 90.000 below is affordable overall and only breaches the first sale.
    await service.postDirectSale(
      {
        idempotencyKey: "sale-2",
        distributorId: "distributor-1",
        soldAt,
        paidAmountTnd: "0",
        lines: [
          { productId: "product-1", quantity: "40", unitPriceTnd: "2.000" },
        ],
      },
      { actorUserId: "user-1" },
    );
    const saleId = prisma.store.distributorSales[0].id as string;

    await expect(
      service.createDistributorPayment(
        {
          idempotencyKey: "payment-1",
          distributorId: "distributor-1",
          paidAt,
          amountTnd: "90.000",
          allocations: [{ saleId, amountTnd: "90.000" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_ALLOCATION_EXCEEDS_DOCUMENT_BALANCE",
    });
  });

  it("rejects an allocation that targets neither a sale nor a settlement", async () => {
    const { service } = await makeServiceWithUnpaidSale();

    await expect(
      service.createDistributorPayment(
        {
          idempotencyKey: "payment-1",
          distributorId: "distributor-1",
          paidAt,
          amountTnd: "10.000",
          allocations: [{ amountTnd: "10.000" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ALLOCATION_TARGET_REQUIRED",
    });
  });

  it("rejects allocations that do not sum to the payment", async () => {
    const { service, prisma } = await makeServiceWithUnpaidSale();
    const saleId = prisma.store.distributorSales[0].id as string;

    await expect(
      service.createDistributorPayment(
        {
          idempotencyKey: "payment-1",
          distributorId: "distributor-1",
          paidAt,
          amountTnd: "30.000",
          allocations: [{ saleId, amountTnd: "20.000" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_ALLOCATION_TOTAL_MISMATCH",
    });
  });

  it("rejects paying more than the distributor balance", async () => {
    const { service } = await makeServiceWithUnpaidSale();

    await expect(
      service.createDistributorPayment(
        {
          idempotencyKey: "payment-1",
          distributorId: "distributor-1",
          paidAt,
          amountTnd: "81.000",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
    });
  });

  it("rejects a payment when nothing is due", async () => {
    const prisma = new DistributionPrismaDouble();
    const service = makeDistributionService(prisma as unknown as PrismaClient);

    await expect(
      service.createDistributorPayment(
        {
          idempotencyKey: "payment-1",
          distributorId: "distributor-1",
          paidAt,
          amountTnd: "10.000",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DISTRIBUTOR_BALANCE_NOT_DUE",
    });
  });

  it("returns the same payment on an idempotent retry", async () => {
    const { service, prisma } = await makeServiceWithUnpaidSale();
    const payload = {
      idempotencyKey: "payment-1",
      distributorId: "distributor-1",
      paidAt,
      amountTnd: "30.000",
    };

    const first = await service.createDistributorPayment(payload, {
      actorUserId: "user-1",
    });
    const retry = await service.createDistributorPayment(payload, {
      actorUserId: "user-1",
    });

    expect(retry.payment.id).toBe(first.payment.id);
    expect(prisma.store.distributorPayments).toHaveLength(1);
  });
});

/// Posts an unpaid 80.000 TND direct sale so the distributor owes something.
async function makeServiceWithUnpaidSale(): Promise<{
  prisma: DistributionPrismaDouble;
  service: DistributionService;
}> {
  const prisma = new DistributionPrismaDouble();
  const service = makeDistributionService(prisma as unknown as PrismaClient);

  await service.postDirectSale(
    {
      idempotencyKey: "sale-1",
      distributorId: "distributor-1",
      soldAt,
      paidAmountTnd: "0",
      lines: [
        { productId: "product-1", quantity: "40", unitPriceTnd: "2.000" },
      ],
    },
    { actorUserId: "user-1" },
  );

  return { prisma, service };
}
