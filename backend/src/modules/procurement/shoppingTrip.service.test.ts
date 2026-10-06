import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ExpensesService } from "../expenses/expenses.service.js";
import { ProcurementService } from "./procurement.service.js";
import { PurchasingPrismaDouble } from "./procurement.testDouble.js";
import {
  assertShoppingTripInput,
  ShoppingTripService,
} from "./shoppingTrip.service.js";

/// Issue 018, DEC-V2-009. One validation, two documents, one transaction.
/// 5 October 2026, 10:00 in Tunis.
const now = new Date("2026-10-05T09:00:00.000Z");
const tripDate = new Date("2026-10-05T07:00:00.000Z");
const actor = { actorUserId: "user-1", correlationId: "corr-1" };
const flour = {
  rawMaterialId: "flour",
  enteredUnitId: "kg",
  enteredQuantity: "10",
  unitPriceTnd: "1.200",
};
const bags = {
  categoryId: "packaging",
  description: "Sachets plastiques",
  amountTnd: "12.500",
};
const napkins = {
  categoryId: "packaging",
  description: "Serviettes",
  amountTnd: "4.000",
};

describe("ShoppingTripService", () => {
  it("posts the purchase and the expenses together, linked to the store", async () => {
    const { service, prisma } = makeService();

    const result = await service.post(
      {
        idempotencyKey: "trip-1",
        supplierId: "store-a",
        tripDate,
        supplierReference: "T-42",
        purchase: {
          paymentTerms: "PARTIAL",
          paidAmountTnd: "5.000",
          dueDate: new Date("2026-10-20T00:00:00.000Z"),
          lines: [flour],
        },
        expenses: [bags, napkins],
      },
      actor,
    );

    expect(result.purchase).toMatchObject({
      status: "POSTED",
      reference: "AC-000001",
      totalTnd: "12.000",
      paidAmountTnd: "5.000",
      balanceTnd: "7.000",
      expensesTotalTnd: "16.500",
    });
    expect(result.expenses).toEqual([
      expect.objectContaining({
        reference: "DEP-000001",
        status: "POSTED",
        description: "Sachets plastiques",
        amountTnd: "12.500",
        supplierId: "store-a",
        purchaseId: result.purchase?.id,
        expenseDate: tripDate,
        externalReference: "T-42",
      }),
      expect.objectContaining({
        reference: "DEP-000002",
        description: "Serviettes",
        purchaseId: result.purchase?.id,
      }),
    ]);
    expect(result.totals).toEqual({
      purchaseTnd: "12.000",
      expensesTnd: "16.500",
      totalTnd: "28.500",
      paidTodayTnd: "21.500",
    });

    const store = prisma.snapshot();
    expect(store.inventoryMovements).toHaveLength(1);
    expect(store.supplierLedgerEntries.map((entry) => entry.amountTnd)).toEqual(
      ["12.000", "-5.000"],
    );
    expect(store.supplierPayments).toHaveLength(1);
    expect(store.auditEvents.map((event) => event.action)).toEqual([
      "purchase.create",
      "purchase.post",
      "expense.post",
      "expense.post",
      "shopping_trip.post",
    ]);
    expect(store.auditEvents.at(-1)).toMatchObject({
      entity: "purchase",
      targetId: result.purchase?.id,
    });
    expect(store.idempotencyRecords).toEqual([
      expect.objectContaining({ scope: "shopping_trip.post", key: "trip-1" }),
    ]);
  });

  it("records the expenses alone when no raw material was bought", async () => {
    const { service, prisma } = makeService();

    const result = await service.post(
      {
        idempotencyKey: "trip-2",
        supplierId: "store-a",
        tripDate,
        expenses: [bags],
      },
      actor,
    );

    expect(result.purchase).toBeNull();
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]).toMatchObject({
      supplierId: "store-a",
      purchaseId: null,
    });
    expect(result.totals).toEqual({
      purchaseTnd: "0.000",
      expensesTnd: "12.500",
      totalTnd: "12.500",
      paidTodayTnd: "12.500",
    });

    const store = prisma.snapshot();
    expect(store.purchases).toHaveLength(0);
    expect(store.auditEvents.at(-1)).toMatchObject({
      action: "shopping_trip.post",
      entity: "expense",
      targetId: result.expenses[0]?.id,
    });
  });

  it("records a plain purchase when nothing else was bought", async () => {
    const { service, prisma } = makeService();

    const result = await service.post(
      {
        idempotencyKey: "trip-3",
        supplierId: "store-a",
        tripDate,
        purchase: {
          paymentTerms: "PAID",
          paidAmountTnd: "12.000",
          lines: [flour],
        },
        expenses: [],
      },
      actor,
    );

    expect(result.purchase).toMatchObject({
      status: "POSTED",
      expensesTotalTnd: "0.000",
    });
    expect(result.expenses).toEqual([]);
    expect(prisma.snapshot().expenses).toHaveLength(0);
  });

  it("rolls the purchase back when an expense category is not active", async () => {
    const { service, prisma } = makeService();

    await expect(
      service.post(
        {
          idempotencyKey: "trip-4",
          supplierId: "store-a",
          tripDate,
          purchase: {
            paymentTerms: "PAID",
            paidAmountTnd: "12.000",
            lines: [flour],
          },
          expenses: [bags, { ...napkins, categoryId: "closed" }],
        },
        actor,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        "expenses.1.categoryId":
          "Une catégorie de dépense active est obligatoire.",
      },
    });

    const store = prisma.snapshot();
    expect(store.purchases).toHaveLength(0);
    expect(store.expenses).toHaveLength(0);
    expect(store.inventoryMovements).toHaveLength(0);
    expect(store.idempotencyRecords).toHaveLength(0);
  });

  it("rolls everything back when the purchase cannot be posted", async () => {
    const { service, prisma } = makeService();
    prisma.removeMainLocation();

    await expect(
      service.post(
        {
          idempotencyKey: "trip-5",
          supplierId: "store-a",
          tripDate,
          purchase: {
            paymentTerms: "PAID",
            paidAmountTnd: "12.000",
            lines: [flour],
          },
          expenses: [bags],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "MAIN_STOCK_LOCATION_MISSING" });

    const store = prisma.snapshot();
    expect(store.purchases).toHaveLength(0);
    expect(store.expenses).toHaveLength(0);
    expect(store.auditEvents).toHaveLength(0);
  });

  it("refuses an inactive store before writing anything", async () => {
    const { service, prisma } = makeService();

    await expect(
      service.post(
        {
          idempotencyKey: "trip-6",
          supplierId: "store-closed",
          tripDate,
          expenses: [bags],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_SUPPLIER_REQUIRED" });
    expect(prisma.snapshot().expenses).toHaveLength(0);
  });

  it("replays the same trip on the same key instead of recording it twice", async () => {
    const { service, prisma } = makeService();
    const input = {
      idempotencyKey: "trip-7",
      supplierId: "store-a",
      tripDate,
      purchase: {
        paymentTerms: "PAID" as const,
        paidAmountTnd: "12.000",
        lines: [flour],
      },
      expenses: [bags],
    };

    const first = await service.post(input, actor);
    const second = await service.post(input, actor);

    expect(second.purchase?.id).toBe(first.purchase?.id);
    expect(second.expenses.map((expense) => expense.id)).toEqual(
      first.expenses.map((expense) => expense.id),
    );
    expect(prisma.snapshot().purchases).toHaveLength(1);
    expect(prisma.snapshot().expenses).toHaveLength(1);
  });

  it("refuses a different trip on a used key", async () => {
    const { service } = makeService();

    await service.post(
      {
        idempotencyKey: "trip-8",
        supplierId: "store-a",
        tripDate,
        expenses: [bags],
      },
      actor,
    );

    await expect(
      service.post(
        {
          idempotencyKey: "trip-8",
          supplierId: "store-a",
          tripDate,
          expenses: [napkins],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

describe("assertShoppingTripInput", () => {
  const errorsOf = (run: () => void) => {
    try {
      run();
    } catch (error) {
      return error as { code: string; fieldErrors?: Record<string, string> };
    }
    return null;
  };

  it("refuses a trip with nothing on it", () => {
    expect(
      errorsOf(() =>
        assertShoppingTripInput(
          { supplierId: "store-a", tripDate, expenses: [] },
          now,
        ),
      ),
    ).toMatchObject({ code: "SHOPPING_TRIP_EMPTY" });
  });

  it("answers every mistake at once on the field concerned", () => {
    const error = errorsOf(() =>
      assertShoppingTripInput(
        {
          supplierId: "store-a",
          tripDate: new Date("2026-10-06T09:00:00.000Z"),
          purchase: {
            paymentTerms: "PAID",
            paidAmountTnd: "0",
            lines: [flour, { ...flour, enteredQuantity: "0" }],
          },
          expenses: [
            { categoryId: "packaging", description: "  ", amountTnd: "0" },
            {
              categoryId: "packaging",
              description: "Serviettes",
              amountTnd: "abc",
            },
          ],
        },
        now,
      ),
    );

    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(error?.fieldErrors).toEqual({
      tripDate: "La date d'achat ne peut pas être dans le futur.",
      "purchase.lines.1.rawMaterialId":
        "Cette matière première est déjà sur une autre ligne.",
      "purchase.lines.1.enteredQuantity":
        "La quantité doit être supérieure à zéro.",
      "expenses.0.description": "Un libellé est obligatoire.",
      "expenses.0.amountTnd": "Le montant doit être supérieur à zéro.",
      "expenses.1.amountTnd": "Le montant doit être supérieur à zéro.",
    });
  });

  it("checks the date of an expenses-only trip too", () => {
    const error = errorsOf(() =>
      assertShoppingTripInput(
        {
          supplierId: "store-a",
          tripDate: new Date("2026-10-06T09:00:00.000Z"),
          expenses: [bags],
        },
        now,
      ),
    );

    expect(error?.fieldErrors).toEqual({
      tripDate: "La date ne peut pas être dans le futur.",
    });
  });

  it("accepts a complete trip of today", () => {
    expect(
      errorsOf(() =>
        assertShoppingTripInput(
          {
            supplierId: "store-a",
            tripDate,
            purchase: {
              paymentTerms: "PAID",
              paidAmountTnd: "12.000",
              lines: [flour],
            },
            expenses: [bags],
          },
          now,
        ),
      ),
    ).toBeNull();
  });
});

function makeService() {
  const prisma = new PurchasingPrismaDouble();
  const client = prisma as unknown as PrismaClient;
  const procurement = new ProcurementService(client);
  const expenses = new ExpensesService(client);
  const service = new ShoppingTripService(client, procurement, expenses);
  return { service, prisma };
}
