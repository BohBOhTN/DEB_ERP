import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ExpensesService } from "../expenses/expenses.service.js";
import { ProcurementService } from "./procurement.service.js";
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
  const prisma = new TripPrismaDouble();
  const client = prisma as unknown as PrismaClient;
  const procurement = new ProcurementService(client);
  const expenses = new ExpensesService(client);
  const service = new ShoppingTripService(client, procurement, expenses);
  return { service, prisma };
}

type Row = Record<string, unknown>;

interface Store {
  suppliers: Row[];
  rawMaterials: Row[];
  stockLocations: Row[];
  expenseCategories: Row[];
  purchases: Row[];
  purchaseLines: Row[];
  inventoryMovements: Row[];
  supplierLedgerEntries: Row[];
  supplierPayments: Row[];
  expenses: Row[];
  auditEvents: Row[];
  idempotencyRecords: Row[];
  sequences: Record<string, number>;
}

function createStore(): Store {
  return {
    suppliers: [
      { id: "store-a", name: "Magasin A", isActive: true },
      { id: "store-closed", name: "Fermé", isActive: false },
    ],
    rawMaterials: [
      {
        id: "flour",
        name: "Farine",
        isActive: true,
        baseUnitId: "kg",
        baseUnit: { id: "kg", name: "kg" },
        conversions: [],
      },
    ],
    stockLocations: [{ id: "loc-main", code: "main" }],
    expenseCategories: [
      { id: "packaging", name: "Emballage", isActive: true },
      { id: "closed", name: "Ancienne", isActive: false },
    ],
    purchases: [],
    purchaseLines: [],
    inventoryMovements: [],
    supplierLedgerEntries: [],
    supplierPayments: [],
    expenses: [],
    auditEvents: [],
    idempotencyRecords: [],
    sequences: {},
  };
}

/// Every table the three services touch on a trip, staged per transaction
/// and committed only when the callback returns, so a failure anywhere
/// leaves the store as it was.
class TripPrismaDouble {
  private store = createStore();

  public readonly idempotencyRecord = {
    findUnique: async (args: {
      where: { scope_key: { scope: string; key: string } };
    }) => findRecord(this.store, args.where.scope_key),
  };

  public async $transaction<TResult>(
    action: (tx: ReturnType<typeof makeTx>) => Promise<TResult>,
  ): Promise<TResult> {
    const staged = structuredClone(this.store);
    const result = await action(makeTx(staged));
    this.store = staged;
    return result;
  }

  public removeMainLocation() {
    this.store.stockLocations = [];
  }

  public snapshot() {
    return this.store;
  }
}

function findRecord(store: Store, key: { scope: string; key: string }) {
  return (
    store.idempotencyRecords.find(
      (record) => record.scope === key.scope && record.key === key.key,
    ) ?? null
  );
}

function matches(row: Row, where?: Row): boolean {
  if (!where) {
    return true;
  }
  return Object.entries(where).every(([key, value]) => {
    const actual = row[key];
    if (value && typeof value === "object" && "in" in (value as Row)) {
      return ((value as { in: unknown[] }).in ?? []).includes(actual);
    }
    return actual === value;
  });
}

function makeTx(store: Store) {
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;
  const nextval = (sequence: string) => {
    store.sequences[sequence] = (store.sequences[sequence] ?? 0) + 1;
    return [{ nextval: BigInt(store.sequences[sequence]) }];
  };
  const hydratePurchase = (purchase: Row | undefined, include?: Row) => {
    if (!purchase) {
      return null;
    }
    return {
      ...purchase,
      supplier: store.suppliers.find((row) => row.id === purchase.supplierId),
      lines: store.purchaseLines.filter(
        (row) => row.purchaseId === purchase.id,
      ),
      payments: store.supplierPayments.filter(
        (row) => row.purchaseId === purchase.id,
      ),
      ledgerEntries: store.supplierLedgerEntries.filter(
        (row) => row.purchaseId === purchase.id,
      ),
      ...(include && "expenses" in include
        ? {
            expenses: store.expenses
              .filter((row) => row.purchaseId === purchase.id)
              .map((row) => ({
                id: row.id,
                reference: row.reference,
                description: row.description,
                amountTnd: row.amountTnd,
                status: row.status,
                category: store.expenseCategories.find(
                  (category) => category.id === row.categoryId,
                ),
              })),
          }
        : {}),
    };
  };
  const insert = (table: Row[], prefix: string, data: Row) => {
    const row: Row & { id: string } = { id: id(prefix), ...data };
    table.push(row);
    return row;
  };

  return {
    $queryRawUnsafe: async (sql: string) =>
      nextval(/nextval\('([^']+)'\)/.exec(sql)?.[1] ?? "unknown"),
    $queryRaw: async () => nextval("expense_reference_seq"),
    supplier: {
      findFirst: async (args: { where: Row }) =>
        store.suppliers.find((row) => matches(row, args.where)) ?? null,
    },
    rawMaterial: {
      findMany: async (args: { where: Row }) =>
        store.rawMaterials.filter((row) => matches(row, args.where)),
    },
    stockLocation: {
      findUnique: async (args: { where: { code: string } }) =>
        store.stockLocations.find((row) => row.code === args.where.code) ??
        null,
    },
    expenseCategory: {
      findMany: async (args: { where: Row }) =>
        store.expenseCategories.filter((row) => matches(row, args.where)),
      findUnique: async (args: { where: { id: string } }) =>
        store.expenseCategories.find((row) => row.id === args.where.id) ?? null,
    },
    purchase: {
      create: async (args: { data: Row; include?: Row }) => {
        const { lines, ...data } = args.data as Row & {
          lines: { createMany: { data: Row[] } };
        };
        const purchase = insert(store.purchases, "purchase", {
          status: "DRAFT",
          reference: null,
          ...data,
        });
        for (const line of lines.createMany.data) {
          insert(store.purchaseLines, "line", {
            ...line,
            purchaseId: purchase.id,
          });
        }
        return hydratePurchase(purchase, args.include);
      },
      findUnique: async (args: { where: { id: string }; include?: Row }) =>
        hydratePurchase(
          store.purchases.find((row) => row.id === args.where.id),
          args.include,
        ),
      update: async (args: {
        where: { id: string };
        data: Row;
        include?: Row;
      }) => {
        const purchase = store.purchases.find(
          (row) => row.id === args.where.id,
        );
        if (!purchase) {
          throw new Error("missing purchase");
        }
        Object.assign(purchase, args.data);
        return hydratePurchase(purchase, args.include);
      },
    },
    inventoryMovement: {
      createMany: async (args: { data: Row[] }) => {
        for (const row of args.data) {
          insert(store.inventoryMovements, "movement", row);
        }
        return { count: args.data.length };
      },
    },
    supplierLedgerEntry: {
      create: async (args: { data: Row }) =>
        insert(store.supplierLedgerEntries, "ledger", args.data),
      aggregate: async (args: { where: Row }) => ({
        _sum: {
          amountTnd: store.supplierLedgerEntries
            .filter((row) => matches(row, args.where))
            .reduce((sum, row) => sum + Number(row.amountTnd), 0)
            .toFixed(3),
        },
      }),
    },
    supplierPayment: {
      create: async (args: { data: Row }) =>
        insert(store.supplierPayments, "payment", args.data),
    },
    expense: {
      create: async (args: { data: Row }) => {
        const expense = insert(store.expenses, "expense", {
          version: 1,
          ...args.data,
        });
        return {
          ...expense,
          category: store.expenseCategories.find(
            (row) => row.id === expense.categoryId,
          ),
          supplier: store.suppliers.find(
            (row) => row.id === expense.supplierId,
          ),
          purchase: null,
        };
      },
    },
    auditEvent: {
      create: async (args: { data: Row }) => {
        insert(store.auditEvents, "audit", args.data);
      },
    },
    idempotencyRecord: {
      create: async (args: { data: Row }) =>
        insert(store.idempotencyRecords, "idem", {
          response: null,
          ...args.data,
        }),
      update: async (args: {
        where: { scope_key: { scope: string; key: string } };
        data: Row;
      }) => {
        const record = findRecord(store, args.where.scope_key);
        if (!record) {
          throw new Error("missing record");
        }
        Object.assign(record, args.data);
        return record;
      },
    },
  };
}
