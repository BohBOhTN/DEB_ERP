import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DistributionService } from "./distribution.service.js";

/// DST-022 and DST-023: a dispatched quantity cannot be settled twice, and
/// settlement posting is atomic. That is enforced by a row lock on the dispatch
/// plus a check constraint on the dispatch line, neither of which the
/// in-memory double can exercise, so this suite talks to PostgreSQL.
///
/// Point INTEGRATION_DATABASE_URL at a throwaway database. Never the shared
/// remote development database: this suite writes and deletes rows.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (process.env.REQUIRE_INTEGRATION_TESTS && !integrationDatabaseUrl) {
  throw new Error(
    "REQUIRE_INTEGRATION_TESTS is set but INTEGRATION_DATABASE_URL is missing.",
  );
}

type Seeded = Awaited<ReturnType<typeof seedBaseline>>;
type SettlementResult = Awaited<
  ReturnType<DistributionService["postSettlement"]>
>;

const runId = Math.random().toString(36).slice(2, 10);
const mainCode = "main";
const dispatchedQuantity = 100;
const claimedQuantity = 60;
const concurrentAttempts = 4;
const suite = integrationDatabaseUrl ? describe : describe.skip;

suite("DistributionService settlement concurrency", () => {
  let prisma: PrismaClient;
  let service: DistributionService;
  let seeded: Seeded;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: withConnectionLimit(integrationDatabaseUrl as string),
        },
      },
    });
    service = new DistributionService(prisma);
    seeded = await seedBaseline(prisma);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await cleanUp(prisma, seeded);
      await prisma.$disconnect();
    }
  }, 60_000);

  // Four cashiers each claim 60 of a 100 dispatch. Only one can fit, so the
  // rest must be refused rather than over-settling the custody.
  it("settles a dispatched quantity only once under concurrency", async () => {
    const dispatch = await postDispatch(service, seeded);
    const dispatchLineId = dispatch.lines[0].id;

    const results = await Promise.allSettled(
      Array.from({ length: concurrentAttempts }, (_, index) =>
        service.postSettlement(
          {
            idempotencyKey: `settle-${runId}-${dispatch.id}-${index}`,
            dispatchId: dispatch.id,
            settledAt: new Date(),
            lines: [
              {
                dispatchLineId,
                soldQuantity: String(claimedQuantity),
                unitPriceTnd: "2.000",
              },
            ],
          },
          { actorUserId: seeded.user.id },
        ),
      ),
    );
    const fulfilled = results.filter(isFulfilled);
    const rejected = results.filter(isRejected);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(concurrentAttempts - 1);

    for (const failure of rejected) {
      expect(failure.reason).toMatchObject({
        statusCode: 400,
        code: "SETTLEMENT_EXCEEDS_HELD_QUANTITY",
      });
    }

    const line = await prisma.distributorDispatchLine.findUniqueOrThrow({
      where: {
        id: dispatchLineId,
      },
    });

    // Exactly one claim landed, so custody reconciles: 60 sold, 40 still held.
    expect(line.settledSoldQuantity.toFixed(6)).toBe(
      claimedQuantity.toFixed(6),
    );
    expect(line.returnedQuantity.toFixed(6)).toBe((0).toFixed(6));
    expect(line.unaccountedQuantity.toFixed(6)).toBe((0).toFixed(6));
    expect(
      line.dispatchedQuantity
        .minus(line.settledSoldQuantity)
        .minus(line.returnedQuantity)
        .minus(line.unaccountedQuantity)
        .toFixed(6),
    ).toBe((dispatchedQuantity - claimedQuantity).toFixed(6));

    const settlements = await prisma.distributorSettlement.count({
      where: {
        dispatchId: dispatch.id,
      },
    });
    const ledgerEntries = await prisma.distributorLedgerEntry.findMany({
      where: {
        distributorId: seeded.distributor.id,
      },
    });

    expect(settlements).toBe(1);
    // Only the settled 60 are revenue: 60 x 2.000.
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].amountTnd.toFixed(3)).toBe("120.000");
  }, 60_000);

  // The database refuses to over-classify even if the service were bypassed.
  it("rejects a dispatch line that classifies more than was dispatched", async () => {
    const dispatch = await postDispatch(service, seeded);
    const dispatchLineId = dispatch.lines[0].id;

    await expect(
      prisma.distributorDispatchLine.update({
        where: {
          id: dispatchLineId,
        },
        data: {
          settledSoldQuantity: String(dispatchedQuantity + 1),
        },
      }),
    ).rejects.toThrow();
  }, 60_000);
});

function isFulfilled(
  result: PromiseSettledResult<SettlementResult>,
): result is PromiseFulfilledResult<SettlementResult> {
  return result.status === "fulfilled";
}

function isRejected(
  result: PromiseSettledResult<SettlementResult>,
): result is PromiseRejectedResult {
  return result.status === "rejected";
}

async function postDispatch(service: DistributionService, seeded: Seeded) {
  const result = await service.dispatchConsignment(
    {
      idempotencyKey: `dispatch-${runId}-${Math.random().toString(36).slice(2)}`,
      distributorId: seeded.distributor.id,
      dispatchedAt: new Date(),
      lines: [
        {
          productId: seeded.product.id,
          quantity: String(dispatchedQuantity),
        },
      ],
    },
    { actorUserId: seeded.user.id },
  );

  return result.dispatch;
}

async function seedBaseline(prisma: PrismaClient) {
  const user = await prisma.user.create({
    data: {
      email: `distribution+${runId}@dar-el-barka.test`,
      displayName: "Integration Runner",
      passwordHash: "not-a-real-hash",
    },
  });
  const unit = await prisma.unit.create({
    data: {
      code: `DST-UNIT-${runId}`,
      name: "Piece",
      symbol: "pc",
    },
  });
  const category = await prisma.productCategory.create({
    data: {
      name: `Distribution ${runId}`,
      normalizedName: `distribution ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: `Baguette ${runId}`,
      normalizedName: `baguette ${runId}`,
      categoryId: category.id,
      baseUnitId: unit.id,
      salePriceTnd: "2.500",
      isStockable: true,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });
  const distributor = await prisma.distributor.create({
    data: {
      name: `Distributeur ${runId}`,
      normalizedName: `distributeur ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });

  await prisma.stockLocation.upsert({
    where: {
      code: mainCode,
    },
    create: {
      code: mainCode,
      name: "Stock principal",
      isMain: true,
    },
    update: {},
  });

  return { user, unit, category, product, distributor };
}

/// Removes only what this run created. This suite resets no database.
async function cleanUp(prisma: PrismaClient, seeded: Seeded | undefined) {
  if (!seeded) {
    return;
  }

  await prisma.inventoryMovement.deleteMany({
    where: {
      productId: seeded.product.id,
    },
  });
  await prisma.distributorLedgerEntry.deleteMany({
    where: {
      distributorId: seeded.distributor.id,
    },
  });
  await prisma.distributorPaymentAllocation.deleteMany({
    where: {
      payment: {
        distributorId: seeded.distributor.id,
      },
    },
  });
  await prisma.distributorPayment.deleteMany({
    where: {
      distributorId: seeded.distributor.id,
    },
  });
  // Settlement lines reference dispatch lines with ON DELETE RESTRICT, so
  // settlements go before dispatches.
  await prisma.distributorSettlement.deleteMany({
    where: {
      distributorId: seeded.distributor.id,
    },
  });
  await prisma.distributorDispatch.deleteMany({
    where: {
      distributorId: seeded.distributor.id,
    },
  });
  await prisma.distributorSale.deleteMany({
    where: {
      distributorId: seeded.distributor.id,
    },
  });
  await prisma.idempotencyRecord.deleteMany({
    where: {
      key: {
        contains: runId,
      },
    },
  });
  await prisma.auditEvent.deleteMany({
    where: {
      actorUserId: seeded.user.id,
    },
  });
  await prisma.distributor.deleteMany({
    where: {
      id: seeded.distributor.id,
    },
  });
  await prisma.product.deleteMany({
    where: {
      id: seeded.product.id,
    },
  });
  await prisma.productCategory.deleteMany({
    where: {
      id: seeded.category.id,
    },
  });
  await prisma.unit.deleteMany({
    where: {
      id: seeded.unit.id,
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: seeded.user.id,
    },
  });
}

function withConnectionLimit(url: string): string {
  const parsed = new URL(url);

  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", "10");
  }

  return parsed.toString();
}
