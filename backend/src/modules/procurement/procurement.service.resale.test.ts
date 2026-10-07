import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertPurchaseInput,
  ProcurementService,
} from "./procurement.service.js";
import { PurchasingPrismaDouble } from "./procurement.testDouble.js";

/// Issue 019, DEC-V2-010: a purchase line buys a raw material or a product
/// flagged for resale. A resold product is bought in its own unit, enters
/// stock like a raw material, and its cost follows the price just paid.
const actor = { actorUserId: "user-1", correlationId: "corr-1" };
const purchaseDate = new Date("2026-10-05T07:00:00.000Z");
const dueDate = new Date("2026-10-20T00:00:00.000Z");
const flour = {
  rawMaterialId: "flour",
  enteredUnitId: "kg",
  enteredQuantity: "10",
  unitPriceTnd: "1.200",
};
const water = {
  productId: "bottle",
  enteredUnitId: "piece",
  enteredQuantity: "24",
  unitPriceTnd: "0.850",
};
const purchaseOf = (lines: Array<Record<string, string>>) => ({
  supplierId: "store-a",
  purchaseDate,
  paymentTerms: "UNPAID" as const,
  paidAmountTnd: "0",
  dueDate,
  lines: lines as never,
});

function makeService() {
  const prisma = new PurchasingPrismaDouble();
  const service = new ProcurementService(prisma as unknown as PrismaClient);
  return { prisma, service };
}

describe("purchases of resold products", () => {
  it("drafts a purchase mixing a raw material and a resold product", async () => {
    const { service } = makeService();

    const purchase = await service.createPurchase(
      purchaseOf([flour, water]),
      actor,
    );

    expect(purchase).toMatchObject({ status: "DRAFT", totalTnd: "32.400" });
    expect(purchase.lines).toEqual([
      expect.objectContaining({
        rawMaterialId: "flour",
        productId: null,
        rawMaterialNameSnapshot: "Farine",
        lineTotalTnd: "12.000",
      }),
      expect.objectContaining({
        rawMaterialId: null,
        productId: "bottle",
        rawMaterialNameSnapshot: "Eau 1,5 L",
        enteredUnitId: "piece",
        baseUnitId: "piece",
        conversionFactorToBase: "1.000000",
        normalizedQuantity: "24.000000",
        unitPriceTnd: "0.850",
        lineTotalTnd: "20.400",
        baseUnitNameSnapshot: "Pièce",
      }),
    ]);
  });

  it.each([
    ["made here, not flagged for resale", "baguette"],
    ["flagged for resale but inactive", "old-soda"],
    ["unknown", "nowhere"],
  ])("refuses a product %s", async (_case, productId) => {
    const { service, prisma } = makeService();

    await expect(
      service.createPurchase(purchaseOf([{ ...water, productId }]), actor),
    ).rejects.toMatchObject({ code: "ACTIVE_RESALE_PRODUCT_REQUIRED" });
    expect(prisma.snapshot().purchases).toHaveLength(0);
  });

  it("refuses a resold product in a unit that is not its own", async () => {
    const { service } = makeService();

    await expect(
      service.createPurchase(
        purchaseOf([{ ...water, enteredUnitId: "kg" }]),
        actor,
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_UNIT_CONVERSION_REQUIRED" });
  });

  it("answers a line with two items, none, or a repeated product on its field", () => {
    let fieldErrors: Record<string, string> = {};
    try {
      assertPurchaseInput(
        {
          purchaseDate,
          lines: [
            water,
            { ...water, rawMaterialId: "flour" },
            { enteredUnitId: "kg", enteredQuantity: "1", unitPriceTnd: "1" },
            { ...water, enteredQuantity: "6" },
            flour,
          ],
        },
        new Date("2026-10-05T09:00:00.000Z"),
      );
    } catch (error) {
      fieldErrors = (error as { fieldErrors: Record<string, string> })
        .fieldErrors;
    }

    expect(fieldErrors).toEqual({
      "lines.1.rawMaterialId":
        "Choisissez une matière première ou un produit de revente, un seul par ligne.",
      "lines.2.rawMaterialId":
        "Choisissez une matière première ou un produit de revente, un seul par ligne.",
      "lines.3.productId": "Ce produit est déjà sur une autre ligne.",
    });
  });

  it("receives the stock of both kinds and sets the resold product's cost to the price paid", async () => {
    const { service, prisma } = makeService();
    const draft = await service.createPurchase(
      purchaseOf([flour, water]),
      actor,
    );

    const { purchase } = await service.postPurchase(
      draft.id,
      { idempotencyKey: "post-1" },
      actor,
    );

    expect(purchase).toMatchObject({ status: "POSTED", totalTnd: "32.400" });
    const store = prisma.snapshot();
    expect(store.inventoryMovements).toEqual([
      expect.objectContaining({
        itemType: "RAW_MATERIAL",
        rawMaterialId: "flour",
        movementType: "PURCHASE_RECEIPT",
        quantityDelta: "10.000000",
      }),
      expect.objectContaining({
        itemType: "PRODUCT",
        productId: "bottle",
        movementType: "PURCHASE_RECEIPT",
        quantityDelta: "24.000000",
        unitId: "piece",
        itemNameSnapshot: "Eau 1,5 L",
        sourceId: draft.id,
      }),
    ]);
    expect(store.inventoryMovements[1]).not.toHaveProperty("rawMaterialId");
    expect(store.products.find((row) => row.id === "bottle")).toMatchObject({
      approximateCostTnd: "0.850",
      version: 2,
      updatedByUserId: "user-1",
    });
    // The product made here keeps the cost its owner typed.
    expect(store.products.find((row) => row.id === "baguette")).toMatchObject({
      approximateCostTnd: "0.150",
      version: 1,
    });
    expect(store.auditEvents.map((event) => event.action)).toEqual([
      "purchase.create",
      "product.cost_from_purchase",
      "purchase.post",
    ]);
    expect(store.supplierLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "PURCHASE_PAYABLE",
        amountTnd: "32.400",
      }),
    ]);
  });

  it("still receives the stock but leaves the cost when the flag was removed since the draft", async () => {
    const { service, prisma } = makeService();
    const draft = await service.createPurchase(purchaseOf([water]), actor);
    const bottle = prisma
      .snapshot()
      .products.find((row) => row.id === "bottle");
    if (bottle) bottle.isResale = false;

    await service.postPurchase(draft.id, { idempotencyKey: "post-2" }, actor);

    const store = prisma.snapshot();
    expect(store.inventoryMovements).toHaveLength(1);
    expect(store.products.find((row) => row.id === "bottle")).toMatchObject({
      approximateCostTnd: null,
      version: 1,
    });
    expect(
      store.auditEvents.some(
        (event) => event.action === "product.cost_from_purchase",
      ),
    ).toBe(false);
  });

  it("takes the product stock back when the purchase is cancelled, and keeps the cost", async () => {
    const { service, prisma } = makeService();
    const draft = await service.createPurchase(
      purchaseOf([flour, water]),
      actor,
    );
    await service.postPurchase(draft.id, { idempotencyKey: "post-3" }, actor);

    await service.cancelPurchase(
      draft.id,
      { idempotencyKey: "cancel-3", reason: "Livraison refusée" },
      actor,
    );

    const store = prisma.snapshot();
    expect(store.purchases[0]).toMatchObject({ status: "CANCELLED" });
    expect(store.inventoryMovements.slice(2)).toEqual([
      expect.objectContaining({
        itemType: "RAW_MATERIAL",
        rawMaterialId: "flour",
        movementType: "REVERSAL",
        quantityDelta: "-10.000000",
      }),
      expect.objectContaining({
        itemType: "PRODUCT",
        productId: "bottle",
        movementType: "REVERSAL",
        quantityDelta: "-24.000000",
        reason: "Livraison refusée",
      }),
    ]);
    expect(store.products.find((row) => row.id === "bottle")).toMatchObject({
      approximateCostTnd: "0.850",
    });
  });

  it("finds the purchases of a product through the list filter", async () => {
    const { service, prisma } = makeService();
    const seen: unknown[] = [];
    Object.assign(prisma, {
      $transaction: async () => [[], 0],
    });
    Object.defineProperty(prisma, "purchase", {
      value: {
        findMany: (args: { where: unknown }) => {
          seen.push(args.where);
          return [];
        },
        count: () => 0,
      },
    });

    await service.listPurchases({ productId: "bottle", page: 1, pageSize: 25 });

    expect(seen[0]).toMatchObject({
      lines: { some: { productId: "bottle" } },
    });
  });
});
