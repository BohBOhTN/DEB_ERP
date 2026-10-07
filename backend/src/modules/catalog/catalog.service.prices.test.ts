import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { CatalogService } from "./catalog.service.js";

/// Issue 023, DEC-V2-013: a product's sale prices are kept as they
/// change; the prices paid come from the posted purchases themselves.
const actor = { actorUserId: "user-1" };
const money = (value: string) => new Prisma.Decimal(value);
type Row = Record<string, unknown>;

function makePrisma(product: Row) {
  const history: Row[] = [];
  const lineQueries: Row[] = [];
  const prisma = {
    productCategory: { findFirst: async () => ({ id: "category-1" }) },
    unit: { findFirst: async () => ({ id: "unit-piece" }) },
    auditEvent: { create: async () => undefined },
    product: {
      findFirst: async () => null,
      // A snapshot, as Prisma returns one: the update below must not
      // rewrite what the service read before it.
      findUnique: async () => ({ ...product }),
      updateMany: async (args: { data: Row }) => {
        Object.assign(product, args.data, {
          version: Number(product.version) + 1,
        });
        return { count: 1 };
      },
      create: async (args: { data: Row }) => ({
        id: "product-9",
        ...args.data,
      }),
    },
    productSalePriceHistory: {
      create: vi.fn(async (args: { data: Row }) => {
        history.push(args.data);
        return args.data;
      }),
      findMany: async () => [
        {
          id: "h1",
          salePriceTnd: money("1.000"),
          effectiveAt: new Date("2026-09-01T08:00:00.000Z"),
        },
        {
          id: "h2",
          salePriceTnd: money("1.200"),
          effectiveAt: new Date("2026-09-20T08:00:00.000Z"),
        },
      ],
    },
    purchaseLine: {
      findMany: vi.fn(async (args: Row) => {
        lineQueries.push(args);
        return [
          {
            id: "line-1",
            unitPriceTnd: money("0.800"),
            normalizedQuantity: money("24.000000"),
            baseUnitNameSnapshot: "Pièce",
            purchase: {
              id: "purchase-1",
              reference: "AC-000001",
              purchaseDate: new Date("2026-09-05T00:00:00.000Z"),
              supplier: { id: "supplier-1", name: "Grossiste" },
            },
          },
        ];
      }),
    },
    rawMaterial: {
      findUnique: async () => ({ id: "raw-1", baseUnit: {}, conversions: [] }),
    },
  };
  return {
    prisma,
    history,
    lineQueries,
    service: new CatalogService(prisma as unknown as PrismaClient),
  };
}

describe("CatalogService price history", () => {
  it("records the first sale price with the product", async () => {
    const { service } = makePrisma({});

    const created = (await service.createProduct(
      {
        name: "Eau 1,5 L",
        categoryId: "category-1",
        baseUnitId: "unit-piece",
        salePriceTnd: "1.200",
        isStockable: true,
      },
      actor,
    )) as unknown as Row;

    expect(created.salePriceHistory).toEqual({
      create: { salePriceTnd: "1.200", actorUserId: "user-1" },
    });
  });

  it("adds a point when the sale price changes, none when it does not", async () => {
    const { service, history } = makePrisma({
      id: "product-1",
      salePriceTnd: money("1.000"),
      isActive: true,
      isResale: true,
      version: 1,
    });

    await service.updateProduct(
      "product-1",
      { version: 1, salePriceTnd: "1.000", notes: "same price" },
      actor,
    );
    expect(history).toEqual([]);

    await service.updateProduct(
      "product-1",
      { version: 2, salePriceTnd: "1.200" },
      actor,
    );
    expect(history).toEqual([
      { productId: "product-1", salePriceTnd: "1.200", actorUserId: "user-1" },
    ]);
  });

  it("reads the sale prices beside the prices paid, the latter behind purchases.view", async () => {
    const { service, lineQueries } = makePrisma({
      id: "product-1",
      salePriceTnd: money("1.200"),
      version: 2,
    });

    const full = await service.getProductPriceHistory("product-1", {
      withPurchases: true,
    });
    expect(full.currentSalePriceTnd).toEqual(money("1.200"));
    expect(full.salePrices.map((row) => row.salePriceTnd.toFixed(3))).toEqual([
      "1.000",
      "1.200",
    ]);
    expect(full.purchasePrices).toEqual([
      {
        lineId: "line-1",
        purchaseId: "purchase-1",
        reference: "AC-000001",
        purchasedAt: new Date("2026-09-05T00:00:00.000Z"),
        supplier: { id: "supplier-1", name: "Grossiste" },
        unitPriceTnd: money("0.800"),
        quantity: money("24.000000"),
        unitName: "Pièce",
      },
    ]);
    // Posted purchases of this product only, oldest first.
    expect(lineQueries[0]).toMatchObject({
      where: { productId: "product-1", purchase: { status: "POSTED" } },
      orderBy: [{ purchase: { purchaseDate: "asc" } }, { createdAt: "asc" }],
    });

    const without = await service.getProductPriceHistory("product-1", {
      withPurchases: false,
    });
    expect(without.purchasePrices).toBeNull();
    expect(lineQueries).toHaveLength(1);
  });

  it("reads the prices paid for a raw material", async () => {
    const { service, lineQueries } = makePrisma({});

    const history = await service.getRawMaterialPriceHistory("raw-1");

    expect(history.purchasePrices).toHaveLength(1);
    expect(lineQueries[0]).toMatchObject({
      where: { rawMaterialId: "raw-1", purchase: { status: "POSTED" } },
    });
  });
});
