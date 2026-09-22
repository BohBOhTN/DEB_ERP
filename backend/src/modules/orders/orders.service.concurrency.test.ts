import {
  CustomerOrderStatus,
  PosSessionStatus,
  PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrdersService } from "./orders.service.js";

/// ORD-012 and AS-011 are enforced by a row lock plus a guarded status update,
/// which only a real database can exercise. The in-memory double in
/// `orders.service.test.ts` runs transactions one after another and can never
/// prove this, so this suite talks to PostgreSQL.
///
/// Point INTEGRATION_DATABASE_URL at a throwaway database. Never the shared
/// remote development database: this suite writes and deletes rows.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

/// CI sets this so a missing database fails the build instead of quietly
/// skipping the one test that proves an order cannot become two sales.
if (process.env.REQUIRE_INTEGRATION_TESTS && !integrationDatabaseUrl) {
  throw new Error(
    "REQUIRE_INTEGRATION_TESTS is set but INTEGRATION_DATABASE_URL is missing.",
  );
}

type Seeded = Awaited<ReturnType<typeof seedBaseline>>;
type CompletionResult = Awaited<ReturnType<OrdersService["completeOrder"]>>;

const runId = Math.random().toString(36).slice(2, 10);
const mainCode = "main";
const concurrentAttempts = 4;
const orderQuantity = 16;
const suite = integrationDatabaseUrl ? describe : describe.skip;

suite("OrdersService completion concurrency", () => {
  let prisma: PrismaClient;
  let service: OrdersService;
  let seeded: Seeded;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: withConnectionLimit(integrationDatabaseUrl as string),
        },
      },
    });
    service = new OrdersService(prisma);
    seeded = await seedBaseline(prisma);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await cleanUp(prisma, seeded);
      await prisma.$disconnect();
    }
  }, 60_000);

  // AS-011: two concurrent completion attempts result in one linked sale only.
  it("creates exactly one linked sale under concurrent completion", async () => {
    const order = await createConfirmedOrder(service, seeded);
    const before = await countEffects(prisma, seeded);

    // Every promise is built in one synchronous pass so the transactions
    // really overlap rather than running one after another.
    const results = await Promise.allSettled(
      Array.from({ length: concurrentAttempts }, (_, index) =>
        service.completeOrder(
          order.id,
          {
            // Distinct keys: this is two cashiers posting the same order, not
            // one client retrying. Idempotency alone cannot save us here.
            idempotencyKey: `complete-${runId}-${order.id}-${index}`,
            completedAt: new Date(),
          },
          { actorUserId: seeded.user.id },
        ),
      ),
    );
    const fulfilled = results.filter(isFulfilled);
    const rejected = results.filter(isRejected);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(concurrentAttempts - 1);

    // Every loser must fail for the documented reason, not by chance.
    for (const failure of rejected) {
      expect(failure.reason).toMatchObject({
        statusCode: 409,
        code: expect.stringMatching(
          /^(ORDER_NOT_COMPLETABLE|ORDER_ALREADY_COMPLETED)$/,
        ),
      });
    }

    const persisted = await prisma.customerOrder.findUniqueOrThrow({
      where: {
        id: order.id,
      },
      include: {
        sale: {
          include: {
            lines: true,
          },
        },
      },
    });

    expect(persisted.status).toBe(CustomerOrderStatus.COMPLETED);
    expect(persisted.saleId).toBe(fulfilled[0].value.order.saleId);
    expect(persisted.advanceBalanceTnd.toFixed(3)).toBe("0.000");
    expect(persisted.sale?.lines).toHaveLength(1);
    expect(persisted.sale?.totalTnd.toFixed(3)).toBe("40.000");

    // The rolled-back attempts must leave nothing behind: exactly one sale,
    // one stock movement, and one payment more than before the race.
    const after = await countEffects(prisma, seeded);

    expect(after.sales - before.sales).toBe(1);
    expect(after.saleLines - before.saleLines).toBe(1);
    expect(after.movements - before.movements).toBe(1);
    expect(after.payments - before.payments).toBe(1);
    // Completion defaulted to paying the full total, so no receivable opened.
    expect(after.ledgerEntries - before.ledgerEntries).toBe(0);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: {
        sourceId: persisted.saleId as string,
      },
    });

    expect(movement.quantityDelta.toFixed(6)).toBe(
      `-${orderQuantity.toFixed(6)}`,
    );
  }, 60_000);

  // A single client double-submitting reuses one key. The invariant holds
  // either way: one sale, whichever attempt wins the race.
  it("creates exactly one linked sale under a concurrent duplicate submit", async () => {
    const order = await createConfirmedOrder(service, seeded);
    const before = await countEffects(prisma, seeded);
    const idempotencyKey = `complete-duplicate-${runId}-${order.id}`;
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        service.completeOrder(
          order.id,
          {
            idempotencyKey,
            completedAt: new Date(),
          },
          { actorUserId: seeded.user.id },
        ),
      ),
    );

    expect(results.filter(isFulfilled).length).toBeGreaterThanOrEqual(1);

    const persisted = await prisma.customerOrder.findUniqueOrThrow({
      where: {
        id: order.id,
      },
    });
    const after = await countEffects(prisma, seeded);

    expect(persisted.status).toBe(CustomerOrderStatus.COMPLETED);
    expect(persisted.saleId).not.toBeNull();
    expect(after.sales - before.sales).toBe(1);
    expect(after.movements - before.movements).toBe(1);
    expect(after.payments - before.payments).toBe(1);
  }, 60_000);
});

function isFulfilled(
  result: PromiseSettledResult<CompletionResult>,
): result is PromiseFulfilledResult<CompletionResult> {
  return result.status === "fulfilled";
}

function isRejected(
  result: PromiseSettledResult<CompletionResult>,
): result is PromiseRejectedResult {
  return result.status === "rejected";
}

/// Counts only rows this run can have produced, so the two tests stay
/// independent of each other and of anything else in the database.
async function countEffects(prisma: PrismaClient, seeded: Seeded) {
  const [sales, saleLines, movements, payments, ledgerEntries] =
    await prisma.$transaction([
      prisma.sale.count({
        where: {
          customerId: seeded.customer.id,
        },
      }),
      prisma.saleLine.count({
        where: {
          productId: seeded.product.id,
        },
      }),
      prisma.inventoryMovement.count({
        where: {
          productId: seeded.product.id,
        },
      }),
      prisma.salePayment.count({
        where: {
          sale: {
            customerId: seeded.customer.id,
          },
        },
      }),
      prisma.customerLedgerEntry.count({
        where: {
          customerId: seeded.customer.id,
        },
      }),
    ]);

  return { sales, saleLines, movements, payments, ledgerEntries };
}

async function createConfirmedOrder(service: OrdersService, seeded: Seeded) {
  const created = await service.createOrder(
    {
      idempotencyKey: `order-${runId}-${Math.random().toString(36).slice(2)}`,
      customerId: seeded.customer.id,
      requestedFulfillmentAt: new Date(Date.now() + 86_400_000),
      lines: [
        {
          productId: seeded.product.id,
          quantity: String(orderQuantity),
        },
      ],
    },
    { actorUserId: seeded.user.id },
  );
  const confirmed = await service.changeOrderStatus(
    created.order.id,
    {
      version: created.order.version,
      status: CustomerOrderStatus.CONFIRMED,
    },
    { actorUserId: seeded.user.id },
  );

  return confirmed.order;
}

async function seedBaseline(prisma: PrismaClient) {
  const user = await prisma.user.create({
    data: {
      email: `integration+${runId}@dar-el-barka.test`,
      displayName: "Integration Runner",
      passwordHash: "not-a-real-hash",
    },
  });
  const unit = await prisma.unit.create({
    data: {
      code: `INT-UNIT-${runId}`,
      name: "Piece",
      symbol: "pc",
    },
  });
  const category = await prisma.productCategory.create({
    data: {
      name: `Integration ${runId}`,
      normalizedName: `integration ${runId}`,
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
  const customer = await prisma.customer.create({
    data: {
      name: `Client ${runId}`,
      normalizedName: `client ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });

  // The main location and terminal are singletons the services look up by code.
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
  const terminal = await prisma.posTerminal.upsert({
    where: {
      code: mainCode,
    },
    create: {
      code: mainCode,
      name: "Caisse principale",
    },
    update: {
      isActive: true,
    },
  });

  // Only one session may be open at a time, so reuse one if the database
  // already has it.
  const existingSession = await prisma.posSession.findFirst({
    where: {
      terminalId: terminal.id,
      status: PosSessionStatus.OPEN,
    },
  });
  const session =
    existingSession ??
    (await prisma.posSession.create({
      data: {
        terminalId: terminal.id,
        openedAt: new Date(),
        openedByUserId: user.id,
        openingCashTnd: "0.000",
      },
    }));

  return {
    user,
    unit,
    category,
    product,
    customer,
    session,
    createdSession: existingSession === null,
  };
}

/// Removes only what this run created. The shared remote development database
/// must never be reset, and this suite resets no database either.
async function cleanUp(prisma: PrismaClient, seeded: Seeded | undefined) {
  if (!seeded) {
    return;
  }

  const orders = await prisma.customerOrder.findMany({
    where: {
      customerId: seeded.customer.id,
    },
    select: {
      id: true,
      saleId: true,
    },
  });
  const orderIds = orders.map((order) => order.id);
  const saleIds = orders
    .map((order) => order.saleId)
    .filter((saleId): saleId is string => saleId !== null);

  await prisma.inventoryMovement.deleteMany({
    where: {
      productId: seeded.product.id,
    },
  });
  await prisma.customerLedgerEntry.deleteMany({
    where: {
      customerId: seeded.customer.id,
    },
  });
  await prisma.salePayment.deleteMany({
    where: {
      saleId: {
        in: saleIds,
      },
    },
  });
  await prisma.customerOrderAdvance.deleteMany({
    where: {
      orderId: {
        in: orderIds,
      },
    },
  });
  // Orders reference sales with ON DELETE RESTRICT, so orders go first.
  await prisma.customerOrder.deleteMany({
    where: {
      id: {
        in: orderIds,
      },
    },
  });
  await prisma.sale.deleteMany({
    where: {
      id: {
        in: saleIds,
      },
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

  if (seeded.createdSession) {
    await prisma.posSession.deleteMany({
      where: {
        id: seeded.session.id,
      },
    });
  }

  await prisma.customer.deleteMany({
    where: {
      id: seeded.customer.id,
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

/// Each concurrent attempt holds its own interactive transaction, so the pool
/// must be able to serve all of them at once.
function withConnectionLimit(url: string): string {
  const parsed = new URL(url);

  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", "10");
  }

  return parsed.toString();
}
