/// A Prisma double for the purchasing flows (issues 018 and 019): drafts,
/// postings, cancellations and shopping trips, over raw materials, resold
/// products and expenses.
export type Row = Record<string, unknown>;

export interface Store {
  suppliers: Row[];
  rawMaterials: Row[];
  products: Row[];
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
    // Issue 019: one product bought to be resold, one made here, one
    // resold product no longer active.
    products: [
      {
        id: "bottle",
        name: "Eau 1,5 L",
        isActive: true,
        isResale: true,
        baseUnitId: "piece",
        baseUnit: { id: "piece", name: "Pièce" },
        approximateCostTnd: null,
        version: 1,
      },
      {
        id: "baguette",
        name: "Baguette",
        isActive: true,
        isResale: false,
        baseUnitId: "piece",
        baseUnit: { id: "piece", name: "Pièce" },
        approximateCostTnd: "0.150",
        version: 1,
      },
      {
        id: "old-soda",
        name: "Soda arrêté",
        isActive: false,
        isResale: true,
        baseUnitId: "piece",
        baseUnit: { id: "piece", name: "Pièce" },
        approximateCostTnd: null,
        version: 1,
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

/// Every table the purchase, expense and trip services touch, staged per
/// transaction and committed only when the callback returns, so a failure
/// anywhere leaves the store as it was. Calls made outside a transaction
/// (a draft created on its own) write straight to the store.
export class PurchasingPrismaDouble {
  private store = createStore();

  public get supplier() {
    return makeTx(this.store).supplier;
  }

  public get rawMaterial() {
    return makeTx(this.store).rawMaterial;
  }

  public get product() {
    return makeTx(this.store).product;
  }

  public get purchase() {
    return makeTx(this.store).purchase;
  }

  public get supplierLedgerEntry() {
    return makeTx(this.store).supplierLedgerEntry;
  }

  public get auditEvent() {
    return makeTx(this.store).auditEvent;
  }

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
    return (actual ?? null) === (value ?? null);
  });
}

function makeTx(store: Store) {
  // Ids come from the store, so two transactions never mint the same one.
  const id = (prefix: string) => {
    store.sequences.id = (store.sequences.id ?? 0) + 1;
    return `${prefix}-${store.sequences.id}`;
  };
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
    product: {
      findMany: async (args: { where: Row }) =>
        store.products.filter((row) => matches(row, args.where)),
      updateMany: async (args: { where: Row; data: Row }) => {
        const rows = store.products.filter((row) => matches(row, args.where));
        for (const row of rows) {
          for (const [key, value] of Object.entries(args.data)) {
            row[key] =
              value && typeof value === "object" && "increment" in value
                ? Number(row[key] ?? 0) +
                  Number((value as { increment: number }).increment)
                : value;
          }
        }
        return { count: rows.length };
      },
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
      createMany: async (args: { data: Row[] }) => {
        for (const row of args.data) {
          insert(store.supplierLedgerEntries, "ledger", row);
        }
        return { count: args.data.length };
      },
      findMany: async (args: { where: Row }) =>
        store.supplierLedgerEntries.filter((row) => matches(row, args.where)),
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
      updateMany: async (args: { where: Row; data: Row }) => {
        const rows = store.supplierPayments.filter((row) =>
          matches(row, args.where),
        );
        for (const row of rows) {
          Object.assign(row, args.data);
        }
        return { count: rows.length };
      },
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
