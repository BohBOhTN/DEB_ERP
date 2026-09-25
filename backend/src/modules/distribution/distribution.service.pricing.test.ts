import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  DistributionPrismaDouble,
  makeDistributionService,
} from "./distribution.testDouble.js";

const soldAt = new Date("2026-09-22T09:00:00.000Z");

/// Issue 009: the direct-sale price is the seller's (DST-009, OD-006) but
/// never below the product's approximate cost when the owner set one.
describe("DistributionService direct-sale pricing", () => {
  const sale = (unitPriceTnd: string, key: string) => ({
    idempotencyKey: key,
    distributorId: "distributor-1",
    soldAt,
    paidAmountTnd: "0",
    lines: [{ productId: "product-1", quantity: "4", unitPriceTnd }],
  });

  it("refuses a unit price below the product's approximate cost", async () => {
    const prisma = new DistributionPrismaDouble();
    prisma.store.products[0]!.approximateCostTnd = "2.000";
    const service = makeDistributionService(prisma as unknown as PrismaClient);

    await expect(
      service.postDirectSale(sale("1.999", "sale-low"), {
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "DISTRIBUTOR_PRICE_BELOW_COST" });
    expect(prisma.store.distributorSales).toHaveLength(0);

    const posted = await service.postDirectSale(sale("2.000", "sale-at"), {
      actorUserId: "user-1",
    });
    expect(posted.sale).toMatchObject({ totalTnd: "8.000" });
    expect(prisma.store.distributorSaleLines[0]).toMatchObject({
      unitPriceTnd: "2.000",
      unitCostTnd: "2.000",
    });
  });

  it("accepts any price when the product has no cost", async () => {
    const prisma = new DistributionPrismaDouble();
    const service = makeDistributionService(prisma as unknown as PrismaClient);

    const posted = await service.postDirectSale(sale("0.100", "sale-free"), {
      actorUserId: "user-1",
    });
    expect(posted.sale).toMatchObject({ totalTnd: "0.400" });
    expect(prisma.store.distributorSaleLines[0]).toMatchObject({
      unitCostTnd: null,
    });
  });
});
