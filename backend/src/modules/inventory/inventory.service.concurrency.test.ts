import { InventoryItemType, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InventoryService } from "./inventory.service.js";

/// AS-V2-03: two stock adjustments posted at the same time commit
/// independently. The V1 service swapped its shared Prisma client for the
/// transaction client of whichever request ran first, so a concurrent request
/// could read and write through another request's transaction. Only a real
/// database with genuinely overlapping transactions can show the fix holds.
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

const runId = Math.random().toString(36).slice(2, 10);
const mainCode = "main";
const concurrentAdjustments = 6;
const suite = integrationDatabaseUrl ? describe : describe.skip;

suite("InventoryService adjustment concurrency", () => {
  let prisma: PrismaClient;
  let service: InventoryService;
  let seeded: Seeded;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: withConnectionLimit(integrationDatabaseUrl as string),
        },
      },
    });
    service = new InventoryService(prisma);
    seeded = await seedBaseline(prisma);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await cleanUp(prisma, seeded);
      await prisma.$disconnect();
    }
  }, 60_000);

  it("commits every concurrent adjustment against its own item", async () => {
    const actor = { actorUserId: seeded.user.id, correlationId: runId };

    const results = await Promise.allSettled(
      seeded.products.flatMap((product, productIndex) =>
        Array.from({ length: concurrentAdjustments }, (_, index) =>
          service.postAdjustment(
            {
              idempotencyKey: `adjust-${runId}-${productIndex}-${index}`,
              itemType: InventoryItemType.PRODUCT,
              itemId: product.id,
              quantityDelta: index % 2 === 0 ? "3.000000" : "-1.000000",
              reason: `Inventaire ${runId}`,
            },
            actor,
          ),
        ),
      ),
    );

    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toEqual([]);

    for (const product of seeded.products) {
      const movements = await prisma.inventoryMovement.findMany({
        where: { productId: product.id },
      });
      expect(movements).toHaveLength(concurrentAdjustments);

      // Three increases of 3 and three decreases of 1 per product.
      const total = movements.reduce(
        (sum, movement) => sum + Number(movement.quantityDelta),
        0,
      );
      expect(total).toBe(3 * 3 - 3 * 1);

      // Every movement snapshots its own item, never a neighbour's.
      for (const movement of movements) {
        expect(movement.itemNameSnapshot).toBe(product.name);
        expect(movement.actorUserId).toBe(seeded.user.id);
      }
    }

    const audits = await prisma.auditEvent.count({
      where: {
        action: "inventory.movement.create",
        correlationId: runId,
      },
    });
    expect(audits).toBe(seeded.products.length * concurrentAdjustments);
  }, 60_000);

  it("replays a duplicate adjustment instead of posting it twice", async () => {
    const product = seeded.products[0];
    const before = await prisma.inventoryMovement.count({
      where: { productId: product.id },
    });
    const command = {
      idempotencyKey: `adjust-duplicate-${runId}`,
      itemType: InventoryItemType.PRODUCT,
      itemId: product.id,
      quantityDelta: "2.000000",
      reason: `Doublon ${runId}`,
    };

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        service.postAdjustment(command, { actorUserId: seeded.user.id }),
      ),
    );

    expect(results.filter((result) => result.status === "rejected")).toEqual(
      [],
    );
    const after = await prisma.inventoryMovement.count({
      where: { productId: product.id },
    });
    expect(after - before).toBe(1);
  }, 60_000);
});

async function seedBaseline(prisma: PrismaClient) {
  const user = await prisma.user.create({
    data: {
      email: `inventory+${runId}@dar-el-barka.test`,
      displayName: "Inventory Runner",
      passwordHash: "not-a-real-hash",
    },
  });
  const unit = await prisma.unit.create({
    data: {
      code: `INV-UNIT-${runId}`,
      name: "Pièce",
      symbol: "pc",
    },
  });
  const category = await prisma.productCategory.create({
    data: {
      name: `Inventaire ${runId}`,
      normalizedName: `inventaire ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });
  const products = await Promise.all(
    ["Pain", "Brioche"].map((name) =>
      prisma.product.create({
        data: {
          name: `${name} ${runId}`,
          normalizedName: `${name.toLowerCase()} ${runId}`,
          categoryId: category.id,
          baseUnitId: unit.id,
          salePriceTnd: "1.000",
          isStockable: true,
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      }),
    ),
  );

  await prisma.stockLocation.upsert({
    where: { code: mainCode },
    create: { code: mainCode, name: "Stock principal", isMain: true },
    update: {},
  });

  return { user, unit, category, products };
}

/// Removes only what this run created; the database is never reset.
async function cleanUp(prisma: PrismaClient, seeded: Seeded | undefined) {
  if (!seeded) {
    return;
  }

  const productIds = seeded.products.map((product) => product.id);

  await prisma.inventoryMovement.deleteMany({
    where: { productId: { in: productIds } },
  });
  await prisma.auditEvent.deleteMany({
    where: { actorUserId: seeded.user.id },
  });
  await prisma.idempotencyRecord.deleteMany({
    where: {
      key: { startsWith: `adjust-` },
      AND: { key: { contains: runId } },
    },
  });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.productCategory.delete({ where: { id: seeded.category.id } });
  await prisma.unit.delete({ where: { id: seeded.unit.id } });
  await prisma.user.delete({ where: { id: seeded.user.id } });
}

function withConnectionLimit(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(
    "connection_limit",
    String(concurrentAdjustments * 2 + 2),
  );
  return parsed.toString();
}
