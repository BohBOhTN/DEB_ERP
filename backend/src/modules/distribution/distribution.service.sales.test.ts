import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { DistributionService } from "./distribution.service.js";
import {
  DistributionPrismaDouble,
  makeDistributionService,
} from "./distribution.testDouble.js";

const soldAt = new Date("2026-09-22T09:00:00.000Z");

describe("DistributionService direct sales", () => {
  // DST-005, DST-006 and DST-008: stock leaves main immediately, the full
  // amount is recognized once, and the unpaid remainder is receivable.
  it("posts a partially paid direct sale with stock, revenue, and receivable", async () => {
    const { service, prisma } = makeService();

    const result = await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        paidAmountTnd: "30.000",
        lines: [
          {
            productId: "product-1",
            quantity: "40",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.sale).toMatchObject({
      reference: "VD-000001",
      totalTnd: "80.000",
      paidAmountTnd: "30.000",
      remainingDueTnd: "50.000",
      paymentState: "PARTIALLY_PAID",
    });
    expect(prisma.store.inventoryMovements).toEqual([
      expect.objectContaining({
        productId: "product-1",
        movementType: "DISTRIBUTOR_DIRECT_SALE",
        quantityDelta: "-40.000000",
      }),
    ]);
    // Full sale receivable, then the money actually received reduces it.
    expect(prisma.store.distributorLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "SALE_RECEIVABLE",
        amountTnd: "80.000",
      }),
      expect.objectContaining({
        entryType: "PAYMENT",
        amountTnd: "-30.000",
      }),
    ]);
    expect(prisma.store.distributorPayments).toHaveLength(1);
  });

  it("uses the entered price rather than the catalogue price", async () => {
    const { service, prisma } = makeService();

    const result = await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        lines: [
          {
            productId: "product-1",
            quantity: "10",
            unitPriceTnd: "1.750",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // The catalogue sale price is 2.500; the distributor price was entered.
    expect(result.sale.totalTnd).toBe("17.500");
    expect(prisma.store.distributorSaleLines[0]).toMatchObject({
      unitPriceTnd: "1.750",
      lineTotalTnd: "17.500",
    });
  });

  it("defaults to a fully paid sale with no receivable left", async () => {
    const { service, prisma } = makeService();

    const result = await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        lines: [
          {
            productId: "product-1",
            quantity: "10",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.sale).toMatchObject({
      paymentState: "PAID",
      remainingDueTnd: "0.000",
    });
    expect(
      prisma.store.distributorLedgerEntries.reduce(
        (total, entry) => total + Number(entry.amountTnd),
        0,
      ),
    ).toBe(0);
  });

  it("returns the same sale on an idempotent retry", async () => {
    const { service, prisma } = makeService();
    const payload = {
      idempotencyKey: "sale-1",
      distributorId: "distributor-1",
      soldAt,
      lines: [
        {
          productId: "product-1",
          quantity: "10",
          unitPriceTnd: "2.000",
        },
      ],
    };

    const first = await service.postDirectSale(payload, {
      actorUserId: "user-1",
    });
    const retry = await service.postDirectSale(payload, {
      actorUserId: "user-1",
    });

    expect(retry.sale.id).toBe(first.sale.id);
    expect(prisma.store.distributorSales).toHaveLength(1);
    expect(prisma.store.inventoryMovements).toHaveLength(1);
  });

  it("rejects paying more than the sale total", async () => {
    const { service } = makeService();

    await expect(
      service.postDirectSale(
        {
          idempotencyKey: "sale-1",
          distributorId: "distributor-1",
          soldAt,
          paidAmountTnd: "21.000",
          lines: [
            {
              productId: "product-1",
              quantity: "10",
              unitPriceTnd: "2.000",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
    });
  });

  it("rejects a sale to an inactive distributor", async () => {
    const { service, prisma } = makeService();
    prisma.store.distributors[0].isActive = false;

    await expect(
      service.postDirectSale(
        {
          idempotencyKey: "sale-1",
          distributorId: "distributor-1",
          soldAt,
          lines: [
            {
              productId: "product-1",
              quantity: "10",
              unitPriceTnd: "2.000",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ACTIVE_DISTRIBUTOR_REQUIRED",
    });
  });

  it("rejects the same product twice in one sale", async () => {
    const { service } = makeService();

    await expect(
      service.postDirectSale(
        {
          idempotencyKey: "sale-1",
          distributorId: "distributor-1",
          soldAt,
          lines: [
            { productId: "product-1", quantity: "1", unitPriceTnd: "2.000" },
            { productId: "product-1", quantity: "2", unitPriceTnd: "2.000" },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DUPLICATE_DISTRIBUTOR_SALE_LINE",
    });
  });

  it("does not move stock for a non-stockable product", async () => {
    const { service, prisma } = makeService();
    prisma.store.products[0].isStockable = false;

    await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        lines: [
          {
            productId: "product-1",
            quantity: "10",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.inventoryMovements).toHaveLength(0);
  });
});

function makeService(): {
  prisma: DistributionPrismaDouble;
  service: DistributionService;
} {
  const prisma = new DistributionPrismaDouble();

  return {
    prisma,
    service: makeDistributionService(prisma as unknown as PrismaClient),
  };
}
