import {
  PurchasePaymentTerms,
  PurchaseStatus,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ProcurementService } from "./procurement.service.js";

describe("ProcurementService supplier payments", () => {
  it("records later supplier payments from ledger balance without stock effects", async () => {
    const prisma = new PaymentPrismaDouble();
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    const result = await service.createSupplierPayment(
      {
        idempotencyKey: "payment-1",
        supplierId: "supplier-1",
        paidAt: new Date("2026-09-21T08:00:00.000Z"),
        amountTnd: "50.000",
        reference: "PAY-1",
        allocations: [
          {
            purchaseId: "purchase-1",
            amountTnd: "50.000",
          },
        ],
      },
      { actorUserId: "user-1", correlationId: "correlation-1" },
    );

    expect(result.payment).toMatchObject({
      supplierId: "supplier-1",
      amountTnd: "50.000",
      reference: "PAY-1",
    });
    expect(result.allocations).toEqual([
      {
        purchaseId: "purchase-1",
        amountTnd: "50.000",
      },
    ]);
    expect(prisma.store.inventoryMovements).toHaveLength(0);
    expect(prisma.store.supplierLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "PURCHASE_PAYABLE",
        amountTnd: "250.000",
      }),
      expect.objectContaining({
        entryType: "PAYMENT",
        amountTnd: "-100.000",
      }),
      expect.objectContaining({
        entryType: "PAYMENT",
        amountTnd: "-50.000",
        paymentId: "payment-1",
        purchaseId: "purchase-1",
      }),
    ]);
  });

  it("returns the same supplier payment on idempotent retry", async () => {
    const prisma = new PaymentPrismaDouble();
    const service = new ProcurementService(prisma as unknown as PrismaClient);
    const payload = {
      idempotencyKey: "payment-1",
      supplierId: "supplier-1",
      paidAt: new Date("2026-09-21T08:00:00.000Z"),
      amountTnd: "50.000",
      allocations: [
        {
          purchaseId: "purchase-1",
          amountTnd: "50.000",
        },
      ],
    };

    await service.createSupplierPayment(payload, { actorUserId: "user-1" });
    const retry = await service.createSupplierPayment(payload, {
      actorUserId: "user-1",
    });

    expect(retry.payment.id).toBe("payment-1");
    expect(prisma.store.supplierPayments).toHaveLength(1);
    expect(
      prisma.store.supplierLedgerEntries.filter(
        (entry) => entry.entryType === "PAYMENT",
      ),
    ).toHaveLength(2);
  });

  it("rejects supplier overpayment while supplier credit is not approved", async () => {
    const prisma = new PaymentPrismaDouble();
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    await expect(
      service.createSupplierPayment(
        {
          idempotencyKey: "payment-over",
          supplierId: "supplier-1",
          paidAt: new Date("2026-09-21T08:00:00.000Z"),
          amountTnd: "151.000",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SUPPLIER_OVERPAYMENT_REJECTED",
    });

    expect(prisma.store.supplierPayments).toHaveLength(0);
  });

  it("rejects allocations that exceed a posted purchase balance", async () => {
    const prisma = new PaymentPrismaDouble();
    prisma.store.purchases.push({
      id: "purchase-2",
      supplierId: "supplier-1",
      status: PurchaseStatus.POSTED,
      totalTnd: "1.000",
      dueDate: new Date("2026-09-30T08:00:00.000Z"),
      paymentTerms: PurchasePaymentTerms.UNPAID,
    });
    prisma.store.supplierLedgerEntries.push({
      id: "ledger-3",
      supplierId: "supplier-1",
      purchaseId: "purchase-2",
      paymentId: null,
      entryType: "PURCHASE_PAYABLE",
      amountTnd: "1.000",
    });
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    await expect(
      service.createSupplierPayment(
        {
          idempotencyKey: "payment-bad-allocation",
          supplierId: "supplier-1",
          paidAt: new Date("2026-09-21T08:00:00.000Z"),
          amountTnd: "151.000",
          allocations: [
            {
              purchaseId: "purchase-1",
              amountTnd: "151.000",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_ALLOCATION_EXCEEDS_PURCHASE_BALANCE",
    });
  });
});

interface PaymentStore {
  suppliers: Array<{ id: string; isActive: boolean; name: string }>;
  purchases: Array<{
    id: string;
    supplierId: string;
    status: PurchaseStatus;
    totalTnd: string;
    dueDate: Date | null;
    paymentTerms: PurchasePaymentTerms;
  }>;
  supplierLedgerEntries: Array<{
    id: string;
    supplierId: string;
    purchaseId: string | null;
    paymentId: string | null;
    entryType: string;
    amountTnd: string;
  }>;
  supplierPayments: Array<{
    id: string;
    supplierId: string;
    purchaseId: string | null;
    amountTnd: string;
    reference?: string | null;
  }>;
  supplierPaymentAllocations: Array<{
    paymentId: string;
    purchaseId: string;
    amountTnd: string;
  }>;
  auditEvents: Array<{ action: string; targetId: string }>;
  idempotencyRecords: Array<{
    scope: string;
    key: string;
    requestHash: string;
    response: unknown;
  }>;
  inventoryMovements: unknown[];
}

class PaymentPrismaDouble {
  public store = createPaymentStore();

  public readonly idempotencyRecord = {
    findUnique: async (args: {
      where: { scope_key: { scope: string; key: string } };
    }) =>
      this.store.idempotencyRecords.find(
        (record) =>
          record.scope === args.where.scope_key.scope &&
          record.key === args.where.scope_key.key,
      ) ?? null,
  };

  public async $transaction<TResult>(
    action:
      | Array<Promise<unknown>>
      | ((
          tx: ReturnType<typeof makePaymentTransactionClient>,
        ) => Promise<TResult>),
  ): Promise<TResult> {
    if (Array.isArray(action)) {
      return (await Promise.all(action)) as TResult;
    }

    const staged = structuredClone(this.store) as PaymentStore;
    const result = await action(makePaymentTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function makePaymentTransactionClient(store: PaymentStore) {
  return {
    supplier: {
      findUnique: async (args: { where: { id: string } }) =>
        store.suppliers.find((supplier) => supplier.id === args.where.id) ??
        null,
    },
    supplierLedgerEntry: {
      findMany: async (args: { where: { supplierId: string } }) =>
        store.supplierLedgerEntries.filter(
          (entry) => entry.supplierId === args.where.supplierId,
        ),
      create: async (args: {
        data: Omit<PaymentStore["supplierLedgerEntries"][number], "id">;
      }) => {
        const entry = {
          ...args.data,
          id: `ledger-${store.supplierLedgerEntries.length + 1}`,
        };
        store.supplierLedgerEntries.push(entry);
        return entry;
      },
      createMany: async (args: {
        data: Array<Omit<PaymentStore["supplierLedgerEntries"][number], "id">>;
      }) => {
        for (const item of args.data) {
          store.supplierLedgerEntries.push({
            ...item,
            id: `ledger-${store.supplierLedgerEntries.length + 1}`,
          });
        }
        return { count: args.data.length };
      },
    },
    supplierPayment: {
      create: async (args: {
        data: Omit<PaymentStore["supplierPayments"][number], "id">;
      }) => {
        const payment = {
          ...args.data,
          id: `payment-${store.supplierPayments.length + 1}`,
        };
        store.supplierPayments.push(payment);
        return payment;
      },
    },
    supplierPaymentAllocation: {
      createMany: async (args: {
        data: PaymentStore["supplierPaymentAllocations"];
      }) => {
        store.supplierPaymentAllocations.push(...args.data);
        return { count: args.data.length };
      },
    },
    purchase: {
      findMany: async (args: {
        where: {
          id: { in: string[] };
          supplierId: string;
          status: PurchaseStatus;
        };
      }) =>
        store.purchases.filter(
          (purchase) =>
            args.where.id.in.includes(purchase.id) &&
            purchase.supplierId === args.where.supplierId &&
            purchase.status === args.where.status,
        ),
    },
    auditEvent: {
      create: async (args: { data: { action: string; targetId: string } }) => {
        store.auditEvents.push(args.data);
      },
    },
    idempotencyRecord: {
      create: async (args: {
        data: { scope: string; key: string; requestHash: string };
      }) => {
        store.idempotencyRecords.push({ ...args.data, response: null });
      },
      update: async (args: {
        where: { scope_key: { scope: string; key: string } };
        data: { response: unknown };
      }) => {
        const record = store.idempotencyRecords.find(
          (item) =>
            item.scope === args.where.scope_key.scope &&
            item.key === args.where.scope_key.key,
        );

        if (!record) {
          throw new Error("missing idempotency record");
        }

        record.response = args.data.response;
        return record;
      },
    },
  };
}

function createPaymentStore(): PaymentStore {
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
        status: PurchaseStatus.POSTED,
        totalTnd: "250.000",
        dueDate: new Date("2026-09-30T08:00:00.000Z"),
        paymentTerms: PurchasePaymentTerms.PARTIAL,
      },
    ],
    supplierLedgerEntries: [
      {
        id: "ledger-1",
        supplierId: "supplier-1",
        purchaseId: "purchase-1",
        paymentId: null,
        entryType: "PURCHASE_PAYABLE",
        amountTnd: "250.000",
      },
      {
        id: "ledger-2",
        supplierId: "supplier-1",
        purchaseId: "purchase-1",
        paymentId: "payment-initial",
        entryType: "PAYMENT",
        amountTnd: "-100.000",
      },
    ],
    supplierPayments: [],
    supplierPaymentAllocations: [],
    auditEvents: [],
    idempotencyRecords: [],
    inventoryMovements: [],
  };
}
