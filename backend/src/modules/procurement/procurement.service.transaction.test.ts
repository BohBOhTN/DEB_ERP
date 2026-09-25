import {
  PurchasePaymentTerms,
  PurchaseStatus,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  ProcurementService,
  type ProcurementTransactionStep,
} from "./procurement.service.js";

const forcedPostSteps: ProcurementTransactionStep[] = [
  "idempotency_record_created",
  "purchase_status_updated",
  "purchase_stock_receipt_created",
  "supplier_payable_created",
  "supplier_payment_created",
  "supplier_payment_ledger_created",
  "purchase_post_audit_created",
  "idempotency_response_saved",
];

describe("ProcurementService purchase posting transaction gate", () => {
  it("commits stock, payable, payment, audit, and idempotency effects together", async () => {
    const prisma = new TransactionalPrismaDouble();
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    await service.postPurchase(
      "purchase-1",
      { idempotencyKey: "post-purchase-1" },
      { actorUserId: "user-1", correlationId: "correlation-1" },
    );

    const snapshot = prisma.snapshot();
    expect(snapshot.purchase.status).toBe(PurchaseStatus.POSTED);
    expect(snapshot.inventoryMovements).toHaveLength(2);
    expect(snapshot.supplierLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "PURCHASE_PAYABLE",
        amountTnd: "250.000",
      }),
      expect.objectContaining({
        entryType: "PAYMENT",
        amountTnd: "-100.000",
      }),
    ]);
    expect(snapshot.supplierPayments).toEqual([
      expect.objectContaining({
        amountTnd: "100.000",
      }),
    ]);
    expect(snapshot.auditEvents).toEqual([
      expect.objectContaining({
        action: "purchase.post",
      }),
    ]);
    expect(snapshot.idempotencyRecords).toEqual([
      expect.objectContaining({
        scope: "purchase.post.purchase-1",
        key: "post-purchase-1",
      }),
    ]);
    expect(payableBalance(snapshot.supplierLedgerEntries)).toBe("150.000");
  });

  it.each(forcedPostSteps)(
    "rolls back every posting effect when %s fails",
    async (forcedStep) => {
      const prisma = new TransactionalPrismaDouble();
      const service = new ProcurementService(
        prisma as unknown as PrismaClient,
        {
          afterStep: (step) => {
            if (step === forcedStep) {
              throw new Error(`forced ${step}`);
            }
          },
        },
      );

      await expect(
        service.postPurchase(
          "purchase-1",
          { idempotencyKey: `post-purchase-${forcedStep}` },
          { actorUserId: "user-1", correlationId: "correlation-1" },
        ),
      ).rejects.toThrow(`forced ${forcedStep}`);

      expect(prisma.snapshot()).toMatchObject(cleanPostingState());
    },
  );
});

interface Store {
  suppliers: SupplierRow[];
  purchases: PurchaseRow[];
  purchaseLines: PurchaseLineRow[];
  stockLocations: StockLocationRow[];
  inventoryMovements: InventoryMovementRow[];
  supplierLedgerEntries: SupplierLedgerEntryRow[];
  supplierPayments: SupplierPaymentRow[];
  auditEvents: AuditEventRow[];
  idempotencyRecords: IdempotencyRecordRow[];
}

interface SupplierRow {
  id: string;
  name: string;
  isActive: boolean;
}

interface PurchaseRow {
  id: string;
  supplierId: string;
  purchaseDate: Date;
  status: PurchaseStatus;
  paymentTerms: PurchasePaymentTerms;
  dueDate: Date | null;
  totalTnd: string;
  paidAmountTnd: string;
  postedAt: Date | null;
  postedByUserId: string | null;
  correlationId: string | null;
  updatedByUserId: string;
}

interface PurchaseLineRow {
  id: string;
  purchaseId: string;
  rawMaterialId: string;
  enteredUnitId: string;
  baseUnitId: string;
  normalizedQuantity: string;
  lineTotalTnd: string;
  rawMaterialNameSnapshot: string;
  baseUnitNameSnapshot: string;
}

interface StockLocationRow {
  id: string;
  code: string;
}

interface InventoryMovementRow {
  id: string;
  sourceId?: string | null;
}

interface SupplierLedgerEntryRow {
  id: string;
  entryType: string;
  amountTnd: string;
}

interface SupplierPaymentRow {
  id: string;
  amountTnd: string;
}

interface AuditEventRow {
  id: string;
  action: string;
}

interface IdempotencyRecordRow {
  id: string;
  scope: string;
  key: string;
  requestHash: string;
  response: unknown;
}

interface FindUniqueArgs {
  where: {
    id?: string;
    code?: string;
    scope_key?: {
      scope: string;
      key: string;
    };
  };
}

interface CreateArgs<TData> {
  data: TData;
}

interface CreateManyArgs<TData> {
  data: TData[];
}

interface UpdateArgs<TData> {
  where: FindUniqueArgs["where"];
  data: TData;
}

interface FakeTransactionClient {
  $queryRawUnsafe: (...args: unknown[]) => Promise<Array<{ nextval: bigint }>>;
  purchase: {
    findUnique: (args: FindUniqueArgs) => Promise<HydratedPurchase | null>;
    update: (
      args: UpdateArgs<Partial<PurchaseRow>>,
    ) => Promise<HydratedPurchase>;
  };
  stockLocation: {
    findUnique: (args: FindUniqueArgs) => Promise<StockLocationRow | null>;
  };
  inventoryMovement: {
    createMany: (
      args: CreateManyArgs<Omit<InventoryMovementRow, "id">>,
    ) => Promise<{ count: number }>;
  };
  supplierLedgerEntry: {
    create: (
      args: CreateArgs<Omit<SupplierLedgerEntryRow, "id">>,
    ) => Promise<SupplierLedgerEntryRow>;
  };
  supplierPayment: {
    create: (
      args: CreateArgs<Omit<SupplierPaymentRow, "id">>,
    ) => Promise<SupplierPaymentRow>;
  };
  auditEvent: {
    create: (args: CreateArgs<Omit<AuditEventRow, "id">>) => Promise<void>;
  };
  idempotencyRecord: {
    create: (
      args: CreateArgs<Omit<IdempotencyRecordRow, "id" | "response">>,
    ) => Promise<IdempotencyRecordRow>;
    update: (
      args: UpdateArgs<Partial<IdempotencyRecordRow>>,
    ) => Promise<IdempotencyRecordRow>;
  };
}

type HydratedPurchase = PurchaseRow & {
  supplier: SupplierRow;
  lines: PurchaseLineRow[];
  payments: SupplierPaymentRow[];
  ledgerEntries: SupplierLedgerEntryRow[];
};

class TransactionalPrismaDouble {
  private store = createStore();

  public readonly idempotencyRecord = {
    findUnique: async (
      args: FindUniqueArgs,
    ): Promise<IdempotencyRecordRow | null> =>
      findIdempotencyRecord(this.store, args),
  };

  public async $transaction<TResult>(
    action: (tx: FakeTransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    const staged = cloneStore(this.store);
    const tx = makeTransactionClient(staged);
    const result = await action(tx);
    this.store = staged;
    return result;
  }

  public snapshot() {
    const purchase = this.store.purchases[0];

    return {
      purchase: {
        id: purchase.id,
        status: purchase.status,
      },
      inventoryMovements: [...this.store.inventoryMovements],
      supplierLedgerEntries: [...this.store.supplierLedgerEntries],
      supplierPayments: [...this.store.supplierPayments],
      auditEvents: [...this.store.auditEvents],
      idempotencyRecords: [...this.store.idempotencyRecords],
    };
  }
}

function makeTransactionClient(store: Store): FakeTransactionClient {
  let sequence = 0;
  return {
    $queryRawUnsafe: async () => [{ nextval: BigInt(++sequence) }],
    purchase: {
      findUnique: async (args) => hydratePurchase(store, args.where.id ?? ""),
      update: async (args) => {
        const purchase = store.purchases.find(
          (candidate) => candidate.id === args.where.id,
        );

        if (!purchase) {
          throw new Error("missing purchase");
        }

        Object.assign(purchase, args.data);
        return hydratePurchase(store, purchase.id) as HydratedPurchase;
      },
    },
    stockLocation: {
      findUnique: async (args) =>
        store.stockLocations.find(
          (location) => location.code === args.where.code,
        ) ?? null,
    },
    inventoryMovement: {
      createMany: async (args) => {
        const rows = args.data.map((row, index) => ({
          ...row,
          id: `movement-${store.inventoryMovements.length + index + 1}`,
        }));
        store.inventoryMovements.push(...rows);
        return { count: rows.length };
      },
    },
    supplierLedgerEntry: {
      create: async (args) => {
        const row = {
          ...args.data,
          id: `ledger-${store.supplierLedgerEntries.length + 1}`,
        };
        store.supplierLedgerEntries.push(row);
        return row;
      },
    },
    supplierPayment: {
      create: async (args) => {
        const row = {
          ...args.data,
          id: `payment-${store.supplierPayments.length + 1}`,
        };
        store.supplierPayments.push(row);
        return row;
      },
    },
    auditEvent: {
      create: async (args) => {
        store.auditEvents.push({
          ...args.data,
          id: `audit-${store.auditEvents.length + 1}`,
        });
      },
    },
    idempotencyRecord: {
      create: async (args) => {
        const row = {
          ...args.data,
          id: `idempotency-${store.idempotencyRecords.length + 1}`,
          response: null,
        };
        store.idempotencyRecords.push(row);
        return row;
      },
      update: async (args) => {
        const row = findIdempotencyRecord(store, args);

        if (!row) {
          throw new Error("missing idempotency record");
        }

        Object.assign(row, args.data);
        return row;
      },
    },
  };
}

function hydratePurchase(
  store: Store,
  purchaseId: string,
): HydratedPurchase | null {
  const purchase = store.purchases.find(
    (candidate) => candidate.id === purchaseId,
  );

  if (!purchase) {
    return null;
  }

  const supplier = store.suppliers.find(
    (candidate) => candidate.id === purchase.supplierId,
  );

  if (!supplier) {
    throw new Error("missing supplier");
  }

  return {
    ...purchase,
    supplier,
    lines: store.purchaseLines.filter(
      (line) => line.purchaseId === purchase.id,
    ),
    payments: store.supplierPayments.filter(
      (payment) => payment.id === purchase.id,
    ),
    ledgerEntries: store.supplierLedgerEntries.filter(
      (entry) => entry.id === purchase.id,
    ),
  };
}

function findIdempotencyRecord(
  store: Store,
  args: FindUniqueArgs,
): IdempotencyRecordRow | null {
  const scopeKey = args.where.scope_key;

  if (!scopeKey) {
    return null;
  }

  return (
    store.idempotencyRecords.find(
      (record) =>
        record.scope === scopeKey.scope && record.key === scopeKey.key,
    ) ?? null
  );
}

function createStore(): Store {
  return {
    suppliers: [
      {
        id: "supplier-1",
        name: "Minoterie Centrale",
        isActive: true,
      },
    ],
    purchases: [
      {
        id: "purchase-1",
        supplierId: "supplier-1",
        purchaseDate: new Date("2026-09-21T08:00:00.000Z"),
        status: PurchaseStatus.DRAFT,
        paymentTerms: PurchasePaymentTerms.PARTIAL,
        dueDate: new Date("2026-09-30T08:00:00.000Z"),
        totalTnd: "250.000",
        paidAmountTnd: "100.000",
        postedAt: null,
        postedByUserId: null,
        correlationId: null,
        updatedByUserId: "user-1",
      },
    ],
    purchaseLines: [
      {
        id: "line-1",
        purchaseId: "purchase-1",
        rawMaterialId: "raw-material-flour",
        enteredUnitId: "unit-bag",
        baseUnitId: "unit-kg",
        normalizedQuantity: "100.000000",
        lineTotalTnd: "200.000",
        rawMaterialNameSnapshot: "Farine",
        baseUnitNameSnapshot: "Kilogramme",
      },
      {
        id: "line-2",
        purchaseId: "purchase-1",
        rawMaterialId: "raw-material-sugar",
        enteredUnitId: "unit-kg",
        baseUnitId: "unit-kg",
        normalizedQuantity: "50.000000",
        lineTotalTnd: "50.000",
        rawMaterialNameSnapshot: "Sucre",
        baseUnitNameSnapshot: "Kilogramme",
      },
    ],
    stockLocations: [
      {
        id: "location-main",
        code: "main",
      },
    ],
    inventoryMovements: [],
    supplierLedgerEntries: [],
    supplierPayments: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

function cleanPostingState() {
  return {
    purchase: {
      id: "purchase-1",
      status: PurchaseStatus.DRAFT,
    },
    inventoryMovements: [],
    supplierLedgerEntries: [],
    supplierPayments: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

function payableBalance(entries: SupplierLedgerEntryRow[]): string {
  return entries
    .reduce((total, entry) => total + Number(entry.amountTnd), 0)
    .toFixed(3);
}

function cloneStore(store: Store): Store {
  return structuredClone(store) as Store;
}
