import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { CatalogService } from "./catalog.service.js";

/// Issue 019, DEC-V2-010: a product bought to be resold is always
/// stock-tracked, whichever way the flag and the switch arrive.
const actor = { actorUserId: "user-1" };
const base = {
  name: "Eau 1,5 L",
  categoryId: "category-1",
  baseUnitId: "unit-piece",
  salePriceTnd: "1.200",
};

type Row = Record<string, unknown>;

function makeService() {
  const products: Row[] = [];
  const lists: Row[] = [];
  const prisma = {
    productCategory: { findFirst: async () => ({ id: "category-1" }) },
    unit: { findFirst: async () => ({ id: "unit-piece" }) },
    auditEvent: { create: async () => undefined },
    $transaction: async (queries: unknown[]) => Promise.all(queries),
    product: {
      findFirst: async () => null,
      findUnique: async (args: { where: { id: string } }) =>
        products.find((row) => row.id === args.where.id) ?? null,
      findMany: async (args: { where: Row }) => {
        lists.push(args.where);
        return [];
      },
      count: async () => 0,
      create: async (args: { data: Row }) => {
        const row = {
          id: `product-${products.length + 1}`,
          version: 1,
          isActive: true,
          ...args.data,
        };
        products.push(row);
        return row;
      },
      updateMany: async (args: { where: Row; data: Row }) => {
        const row = products.find(
          (candidate) =>
            candidate.id === args.where.id &&
            candidate.version === args.where.version,
        );
        if (!row) return { count: 0 };
        for (const [key, value] of Object.entries(args.data)) {
          row[key] = key === "version" ? Number(row.version) + 1 : value;
        }
        return { count: 1 };
      },
    },
  };
  const service = new CatalogService(
    prisma as unknown as PrismaClient,
    undefined as never,
  );
  return { service, products, lists };
}

describe("CatalogService resale products", () => {
  it("stores a resold product stock-tracked even when the switch says no", async () => {
    const { service } = makeService();

    const product = await service.createProduct(
      { ...base, isStockable: false, isResale: true },
      actor,
    );

    expect(product).toMatchObject({ isResale: true, isStockable: true });
  });

  it("keeps a product made here as its form says", async () => {
    const { service } = makeService();

    const product = await service.createProduct(
      { ...base, isStockable: false },
      actor,
    );

    expect(product).toMatchObject({ isResale: false, isStockable: false });
  });

  it("turns stock tracking on when the flag is set on an existing product", async () => {
    const { service } = makeService();
    const created = await service.createProduct(
      { ...base, isStockable: false },
      actor,
    );

    const product = await service.updateProduct(
      created.id,
      { version: 1, isResale: true },
      actor,
    );

    expect(product).toMatchObject({
      isResale: true,
      isStockable: true,
      version: 2,
    });
  });

  it("refuses to stop tracking the stock of a resold product", async () => {
    const { service } = makeService();
    const created = await service.createProduct(
      { ...base, isStockable: true, isResale: true },
      actor,
    );

    const product = await service.updateProduct(
      created.id,
      { version: 1, isStockable: false },
      actor,
    );

    expect(product).toMatchObject({ isResale: true, isStockable: true });
  });

  it("lets the switch go once the product is no longer resold", async () => {
    const { service } = makeService();
    const created = await service.createProduct(
      { ...base, isStockable: true, isResale: true },
      actor,
    );

    const product = await service.updateProduct(
      created.id,
      { version: 1, isResale: false, isStockable: false },
      actor,
    );

    expect(product).toMatchObject({ isResale: false, isStockable: false });
  });

  it("filters the list on the flag", async () => {
    const { service, lists } = makeService();

    await service.listProducts({ isResale: true, page: 1, pageSize: 25 });

    expect(lists[0]).toMatchObject({ isResale: true });
  });
});
