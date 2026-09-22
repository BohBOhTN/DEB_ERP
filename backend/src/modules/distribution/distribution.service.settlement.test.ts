import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { DistributionService } from "./distribution.service.js";
import {
  DistributionPrismaDouble,
  makeDistributionService,
} from "./distribution.testDouble.js";

const dispatchedAt = new Date("2026-09-22T06:00:00.000Z");
const settledAt = new Date("2026-09-22T18:00:00.000Z");

describe("DistributionService settlement", () => {
  // AS-015: settling 80 sold, 15 returned and 5 unaccounted recognizes only 80
  // as sales, returns 15 to main stock, shows 5 as a discrepancy, and does not
  // charge the distributor for those 5.
  it("classifies sold, returned, and unaccounted quantity", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    const result = await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId: prisma.store.distributorDispatches[0].id as string,
        settledAt,
        lines: [
          {
            dispatchLineId,
            soldQuantity: "80",
            returnedQuantity: "15",
            unaccountedQuantity: "5",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // Only the 80 sold are revenue: 80 x 2.000.
    expect(result.settlement).toMatchObject({
      reference: "REG-000001",
      totalTnd: "160.000",
      paidAmountTnd: "0.000",
      remainingDueTnd: "160.000",
      paymentState: "UNPAID",
    });
    expect(prisma.store.distributorLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "SETTLEMENT_RECEIVABLE",
        amountTnd: "160.000",
      }),
    ]);

    // The 15 returned re-enter main stock; the 80 sold already left at
    // dispatch and the 5 unaccounted move nothing.
    const returnMovements = prisma.store.inventoryMovements.filter(
      (movement) => movement.movementType === "DISTRIBUTOR_RETURN_IN",
    );
    expect(returnMovements).toEqual([
      expect.objectContaining({ quantityDelta: "15.000000" }),
    ]);
    expect(prisma.store.inventoryMovements).toHaveLength(2);

    const line = prisma.store.distributorDispatchLines[0];
    expect(line).toMatchObject({
      settledSoldQuantity: "80.000000",
      returnedQuantity: "15.000000",
      unaccountedQuantity: "5.000000",
    });
    // Everything is classified, so the dispatch closes.
    expect(prisma.store.distributorDispatches[0].status).toBe("CLOSED");
  });

  it("leaves still-held quantity in custody across several days", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId: prisma.store.distributorDispatches[0].id as string,
        settledAt,
        lines: [
          {
            dispatchLineId,
            soldQuantity: "30",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // 100 dispatched, 30 sold, so 70 stay with the distributor and the
    // dispatch stays open for a later settlement.
    expect(prisma.store.distributorDispatchLines[0]).toMatchObject({
      settledSoldQuantity: "30.000000",
    });
    expect(prisma.store.distributorDispatches[0].status).toBe("OPEN");

    const custody = await service.listCustody({});
    expect(custody.items[0]).toMatchObject({
      stillHeldQuantity: "70.000000",
    });
  });

  // DST-022: a dispatched quantity cannot be settled twice.
  it("rejects settling more than the distributor still holds", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchId = prisma.store.distributorDispatches[0].id as string;
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId,
        settledAt,
        lines: [{ dispatchLineId, soldQuantity: "60", unitPriceTnd: "2.000" }],
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.postSettlement(
        {
          idempotencyKey: "settlement-2",
          dispatchId,
          settledAt,
          lines: [
            { dispatchLineId, soldQuantity: "50", unitPriceTnd: "2.000" },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SETTLEMENT_EXCEEDS_HELD_QUANTITY",
    });
  });

  it("records a settlement payment against the receivable", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    const result = await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId: prisma.store.distributorDispatches[0].id as string,
        settledAt,
        paidAmountTnd: "100.000",
        lines: [{ dispatchLineId, soldQuantity: "80", unitPriceTnd: "2.000" }],
      },
      { actorUserId: "user-1" },
    );

    expect(result.settlement).toMatchObject({
      totalTnd: "160.000",
      paidAmountTnd: "100.000",
      remainingDueTnd: "60.000",
      paymentState: "PARTIALLY_PAID",
    });
    expect(prisma.store.distributorLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "SETTLEMENT_RECEIVABLE",
        amountTnd: "160.000",
      }),
      expect.objectContaining({ entryType: "PAYMENT", amountTnd: "-100.000" }),
    ]);
  });

  it("rejects paying more than the settled amount", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    await expect(
      service.postSettlement(
        {
          idempotencyKey: "settlement-1",
          dispatchId: prisma.store.distributorDispatches[0].id as string,
          settledAt,
          paidAmountTnd: "200.000",
          lines: [
            { dispatchLineId, soldQuantity: "80", unitPriceTnd: "2.000" },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
    });
  });

  it("returns the same settlement on an idempotent retry", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;
    const payload = {
      idempotencyKey: "settlement-1",
      dispatchId: prisma.store.distributorDispatches[0].id as string,
      settledAt,
      lines: [{ dispatchLineId, soldQuantity: "80", unitPriceTnd: "2.000" }],
    };

    const first = await service.postSettlement(payload, {
      actorUserId: "user-1",
    });
    const retry = await service.postSettlement(payload, {
      actorUserId: "user-1",
    });

    expect(retry.settlement.id).toBe(first.settlement.id);
    expect(prisma.store.distributorSettlements).toHaveLength(1);
    expect(prisma.store.distributorDispatchLines[0]).toMatchObject({
      settledSoldQuantity: "80.000000",
    });
  });

  it("rejects settling a closed dispatch", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchId = prisma.store.distributorDispatches[0].id as string;
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    await service.postSettlement(
      {
        idempotencyKey: "settlement-1",
        dispatchId,
        settledAt,
        lines: [{ dispatchLineId, returnedQuantity: "100", unitPriceTnd: "0" }],
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.postSettlement(
        {
          idempotencyKey: "settlement-2",
          dispatchId,
          settledAt,
          lines: [{ dispatchLineId, soldQuantity: "1", unitPriceTnd: "2.000" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DISPATCH_NOT_OPEN",
    });
  });

  it("rejects a settlement that classifies nothing", async () => {
    const { service, prisma } = await makeServiceWithDispatch();
    const dispatchLineId = prisma.store.distributorDispatchLines[0]
      .id as string;

    await expect(
      service.postSettlement(
        {
          idempotencyKey: "settlement-1",
          dispatchId: prisma.store.distributorDispatches[0].id as string,
          settledAt,
          lines: [{ dispatchLineId, unitPriceTnd: "2.000" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SETTLEMENT_QUANTITY_REQUIRED",
    });
  });
});

async function makeServiceWithDispatch(): Promise<{
  prisma: DistributionPrismaDouble;
  service: DistributionService;
}> {
  const prisma = new DistributionPrismaDouble();
  const service = makeDistributionService(prisma as unknown as PrismaClient);

  await service.dispatchConsignment(
    {
      idempotencyKey: "dispatch-1",
      distributorId: "distributor-1",
      dispatchedAt,
      lines: [{ productId: "product-1", quantity: "100" }],
    },
    { actorUserId: "user-1" },
  );

  return { prisma, service };
}
