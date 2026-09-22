import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { DistributionService } from "./distribution.service.js";
import {
  DistributionPrismaDouble,
  makeDistributionService,
} from "./distribution.testDouble.js";

const dispatchedAt = new Date("2026-09-22T06:00:00.000Z");

describe("DistributionService consignment dispatch", () => {
  // AS-014 and DST-011 to DST-013: dispatching 100 breads moves 100 out of
  // main stock into custody and creates no revenue, receivable, or payment.
  it("moves stock into custody without creating a sale or debt", async () => {
    const { service, prisma } = makeService();

    const result = await service.dispatchConsignment(
      {
        idempotencyKey: "dispatch-1",
        distributorId: "distributor-1",
        dispatchedAt,
        lines: [{ productId: "product-1", quantity: "100" }],
      },
      { actorUserId: "user-1" },
    );

    expect(result.dispatch).toMatchObject({
      reference: "BL-000001",
      status: "OPEN",
    });
    expect(result.dispatch.lines[0]).toMatchObject({
      dispatchedQuantity: "100.000000",
      settledSoldQuantity: "0",
      returnedQuantity: "0",
      unaccountedQuantity: "0",
      stillHeldQuantity: "100.000000",
    });
    expect(prisma.store.inventoryMovements).toEqual([
      expect.objectContaining({
        productId: "product-1",
        movementType: "DISTRIBUTOR_DISPATCH_OUT",
        quantityDelta: "-100.000000",
      }),
    ]);
    // Dispatch is never revenue, debt, or payment.
    expect(prisma.store.distributorSales).toHaveLength(0);
    expect(prisma.store.distributorLedgerEntries).toHaveLength(0);
    expect(prisma.store.distributorPayments).toHaveLength(0);
  });

  it("returns the same dispatch on an idempotent retry", async () => {
    const { service, prisma } = makeService();
    const payload = {
      idempotencyKey: "dispatch-1",
      distributorId: "distributor-1",
      dispatchedAt,
      lines: [{ productId: "product-1", quantity: "100" }],
    };

    const first = await service.dispatchConsignment(payload, {
      actorUserId: "user-1",
    });
    const retry = await service.dispatchConsignment(payload, {
      actorUserId: "user-1",
    });

    expect(retry.dispatch.id).toBe(first.dispatch.id);
    expect(prisma.store.distributorDispatches).toHaveLength(1);
    expect(prisma.store.inventoryMovements).toHaveLength(1);
  });

  it("rejects dispatching to an inactive distributor", async () => {
    const { service, prisma } = makeService();
    prisma.store.distributors[0].isActive = false;

    await expect(
      service.dispatchConsignment(
        {
          idempotencyKey: "dispatch-1",
          distributorId: "distributor-1",
          dispatchedAt,
          lines: [{ productId: "product-1", quantity: "100" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ACTIVE_DISTRIBUTOR_REQUIRED",
    });
  });

  it("rejects the same product twice on one dispatch", async () => {
    const { service } = makeService();

    await expect(
      service.dispatchConsignment(
        {
          idempotencyKey: "dispatch-1",
          distributorId: "distributor-1",
          dispatchedAt,
          lines: [
            { productId: "product-1", quantity: "10" },
            { productId: "product-1", quantity: "20" },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DUPLICATE_DISPATCH_LINE",
    });
  });

  it("rejects a non-positive dispatch quantity", async () => {
    const { service } = makeService();

    await expect(
      service.dispatchConsignment(
        {
          idempotencyKey: "dispatch-1",
          distributorId: "distributor-1",
          dispatchedAt,
          lines: [{ productId: "product-1", quantity: "0" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "POSITIVE_QUANTITY_REQUIRED",
    });
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
