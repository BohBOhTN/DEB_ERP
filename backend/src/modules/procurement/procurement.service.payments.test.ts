import {
  Prisma,
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
      purchaseDate: new Date("2026-09-21T08:00:00.000Z"),
      totalTnd: "1.000",
      paidAmountTnd: "0.000",
      remainingDueTnd: "1.000",
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

function openSecondPurchase(prisma: PaymentPrismaDouble) {
  prisma.store.purchases.push({
    id: "purchase-2",
    supplierId: "supplier-1",
    status: PurchaseStatus.POSTED,
    purchaseDate: new Date("2026-09-22T08:00:00.000Z"),
    totalTnd: "40.000",
    paidAmountTnd: "0.000",
    remainingDueTnd: "40.000",
    dueDate: null,
    paymentTerms: PurchasePaymentTerms.UNPAID,
  });
  prisma.store.supplierLedgerEntries.push({
    id: "ledger-p2",
    supplierId: "supplier-1",
    purchaseId: "purchase-2",
    paymentId: null,
    entryType: "PURCHASE_PAYABLE",
    amountTnd: "40.000",
  });
}

describe("ProcurementService payments settle purchases", () => {
  // SUP-016: a later payment covers one or more posted purchases, oldest
  // first when the user names none, and each purchase's stored state follows.
  it("settles the oldest open purchases first when no allocation is named", async () => {
    const prisma = new PaymentPrismaDouble();
    openSecondPurchase(prisma);
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    const result = await service.createSupplierPayment(
      {
        idempotencyKey: "auto-1",
        supplierId: "supplier-1",
        paidAt: new Date("2026-09-23T08:00:00.000Z"),
        amountTnd: "160.000",
      },
      { actorUserId: "user-1" },
    );

    expect(result.allocations).toEqual([
      { purchaseId: "purchase-1", amountTnd: "150.000" },
      { purchaseId: "purchase-2", amountTnd: "10.000" },
    ]);
    expect(prisma.store.purchases[0]).toMatchObject({
      paidAmountTnd: "250.000",
      remainingDueTnd: "0.000",
    });
    expect(prisma.store.purchases[1]).toMatchObject({
      paidAmountTnd: "10.000",
      remainingDueTnd: "30.000",
    });
    // Two allocations: the payment row names no single purchase.
    expect(prisma.store.supplierPayments[0]?.purchaseId).toBeNull();
  });

  it("completes a partial allocation on the other open purchases", async () => {
    const prisma = new PaymentPrismaDouble();
    openSecondPurchase(prisma);
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    const result = await service.createSupplierPayment(
      {
        idempotencyKey: "partial-1",
        supplierId: "supplier-1",
        paidAt: new Date("2026-09-23T08:00:00.000Z"),
        amountTnd: "60.000",
        allocations: [{ purchaseId: "purchase-2", amountTnd: "40.000" }],
      },
      { actorUserId: "user-1" },
    );

    expect(result.allocations).toEqual([
      { purchaseId: "purchase-1", amountTnd: "20.000" },
      { purchaseId: "purchase-2", amountTnd: "40.000" },
    ]);
  });

  it("refuses a payment to a deactivated supplier", async () => {
    const prisma = new PaymentPrismaDouble();
    const supplier = prisma.store.suppliers[0];
    if (supplier) supplier.isActive = false;
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    await expect(
      service.createSupplierPayment(
        {
          idempotencyKey: "inactive-1",
          supplierId: "supplier-1",
          paidAt: new Date("2026-09-23T08:00:00.000Z"),
          amountTnd: "10.000",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "SUPPLIER_INACTIVE" });
  });

  it("reverses a payment and restores the purchase it had settled", async () => {
    const prisma = new PaymentPrismaDouble();
    const service = new ProcurementService(prisma as unknown as PrismaClient);
    const created = await service.createSupplierPayment(
      {
        idempotencyKey: "to-reverse",
        supplierId: "supplier-1",
        paidAt: new Date("2026-09-23T08:00:00.000Z"),
        amountTnd: "50.000",
      },
      { actorUserId: "user-1" },
    );
    expect(prisma.store.purchases[0]).toMatchObject({
      remainingDueTnd: "100.000",
    });

    const reversed = await service.reverseSupplierPayment(
      created.payment.id,
      { idempotencyKey: "reverse-1", reason: "Double saisie" },
      { actorUserId: "user-2" },
    );

    expect(reversed.payment).toMatchObject({
      reversedByUserId: "user-2",
      reversalReason: "Double saisie",
    });
    expect(prisma.store.supplierLedgerEntries.at(-1)).toMatchObject({
      entryType: "PAYMENT_REVERSAL",
      purchaseId: "purchase-1",
      paymentId: created.payment.id,
      amountTnd: "50.000",
    });
    expect(prisma.store.purchases[0]).toMatchObject({
      paidAmountTnd: "100.000",
      remainingDueTnd: "150.000",
    });
    await expect(
      service.reverseSupplierPayment(
        created.payment.id,
        { idempotencyKey: "reverse-2", reason: "Encore" },
        { actorUserId: "user-2" },
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_ALREADY_REVERSED" });
  });

  // SUP-012: cancelling a purchase paid partly at posting and partly later
  // gives every payment back, each against its own payment record.
  it("cancels a purchase by reversing every payment applied to it", async () => {
    const prisma = new PaymentPrismaDouble();
    const service = new ProcurementService(prisma as unknown as PrismaClient);
    await service.createSupplierPayment(
      {
        idempotencyKey: "later-1",
        supplierId: "supplier-1",
        paidAt: new Date("2026-09-23T08:00:00.000Z"),
        amountTnd: "50.000",
      },
      { actorUserId: "user-1" },
    );

    await service.cancelPurchase(
      "purchase-1",
      { idempotencyKey: "cancel-1", reason: "Livraison refusée" },
      { actorUserId: "user-1" },
    );

    const reversals = prisma.store.supplierLedgerEntries.filter(
      (entry) => entry.entryType === "PAYMENT_REVERSAL",
    );
    expect(
      reversals.map((entry) => [entry.paymentId, entry.amountTnd]),
    ).toEqual([
      ["payment-initial", "100.000"],
      ["payment-1", "50.000"],
    ]);
    const balance = prisma.store.supplierLedgerEntries.reduce(
      (sum, entry) => sum.plus(entry.amountTnd),
      new Prisma.Decimal(0),
    );
    expect(balance.toFixed(3)).toBe("0.000");
    expect(prisma.store.purchases[0]).toMatchObject({
      status: PurchaseStatus.CANCELLED,
      remainingDueTnd: "0.000",
    });
  });

  // Issue 016, the client's case: a purchase paid partly at posting is
  // cancelled, which gives the payment back; cancelling that payment
  // afterwards must not give it back a second time.
  describe("a payment of a cancelled purchase (issue 016)", () => {
    const balanceOf = (prisma: PaymentPrismaDouble) =>
      prisma.store.supplierLedgerEntries
        .reduce(
          (sum, entry) => sum.plus(entry.amountTnd),
          new Prisma.Decimal(0),
        )
        .toFixed(3);
    const actor = { actorUserId: "user-1" };
    /// The fixture carries the ledger entry of the 100 TND paid when the
    /// purchase was posted; these cases need its payment row as well.
    function makeLedger() {
      const prisma = new PaymentPrismaDouble();
      prisma.store.supplierPayments.push({
        id: "payment-initial",
        supplierId: "supplier-1",
        purchaseId: "purchase-1",
        amountTnd: "100.000",
        reversedAt: null,
      });
      return prisma;
    }

    it("marks the payment as taken back by the cancellation and refuses to reverse it", async () => {
      const prisma = makeLedger();
      const service = new ProcurementService(prisma as unknown as PrismaClient);

      await service.cancelPurchase(
        "purchase-1",
        { idempotencyKey: "cancel-1", reason: "Livraison refusée" },
        actor,
      );

      expect(balanceOf(prisma)).toBe("0.000");
      expect(prisma.store.supplierPayments[0]).toMatchObject({
        id: "payment-initial",
        reversedByUserId: "user-1",
        reversalReason: "Achat AC-000001 annulé : Livraison refusée",
      });
      expect(prisma.store.supplierPayments[0]?.reversedAt).toBeInstanceOf(Date);

      await expect(
        service.reverseSupplierPayment(
          "payment-initial",
          { idempotencyKey: "reverse-1", reason: "Erreur de saisie" },
          actor,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_ALREADY_REVERSED",
      });
      expect(balanceOf(prisma)).toBe("0.000");
    });

    it("refuses a payment whose purchase was cancelled before this rule existed", async () => {
      const prisma = makeLedger();
      const service = new ProcurementService(prisma as unknown as PrismaClient);
      await service.cancelPurchase(
        "purchase-1",
        { idempotencyKey: "cancel-1", reason: "Livraison refusée" },
        actor,
      );
      // An older cancellation left the payment row untouched.
      Object.assign(prisma.store.supplierPayments[0] ?? {}, {
        reversedAt: null,
      });

      await expect(
        service.reverseSupplierPayment(
          "payment-initial",
          { idempotencyKey: "reverse-1", reason: "Erreur de saisie" },
          actor,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "PAYMENT_DOCUMENT_CANCELLED",
      });
      expect(balanceOf(prisma)).toBe("0.000");
    });

    it("does not give back a payment cancelled before the purchase", async () => {
      const prisma = makeLedger();
      const service = new ProcurementService(prisma as unknown as PrismaClient);
      const later = await service.createSupplierPayment(
        {
          idempotencyKey: "later-1",
          supplierId: "supplier-1",
          paidAt: new Date("2026-09-23T08:00:00.000Z"),
          amountTnd: "50.000",
        },
        actor,
      );
      await service.reverseSupplierPayment(
        later.payment.id,
        { idempotencyKey: "reverse-1", reason: "Double saisie" },
        actor,
      );

      await service.cancelPurchase(
        "purchase-1",
        { idempotencyKey: "cancel-1", reason: "Livraison refusée" },
        actor,
      );

      // One reversal per payment: the user's for the later one, the
      // cancellation's for the one taken at posting.
      expect(
        prisma.store.supplierLedgerEntries
          .filter((entry) => entry.entryType === "PAYMENT_REVERSAL")
          .map((entry) => [entry.paymentId, entry.amountTnd]),
      ).toEqual([
        ["payment-1", "50.000"],
        ["payment-initial", "100.000"],
      ]);
      expect(balanceOf(prisma)).toBe("0.000");
    });

    it("gives back only the other share of a payment spread over two purchases", async () => {
      const prisma = makeLedger();
      prisma.store.purchases.push({
        id: "purchase-2",
        reference: "AC-000002",
        supplierId: "supplier-1",
        status: PurchaseStatus.POSTED,
        purchaseDate: new Date("2026-09-21T08:00:00.000Z"),
        totalTnd: "80.000",
        paidAmountTnd: "0.000",
        remainingDueTnd: "80.000",
        dueDate: new Date("2026-10-05T08:00:00.000Z"),
        paymentTerms: PurchasePaymentTerms.UNPAID,
      });
      prisma.store.supplierLedgerEntries.push({
        id: "ledger-3",
        supplierId: "supplier-1",
        purchaseId: "purchase-2",
        paymentId: null,
        entryType: "PURCHASE_PAYABLE",
        amountTnd: "80.000",
      });
      const service = new ProcurementService(prisma as unknown as PrismaClient);
      // 150 settle the first purchase, the oldest; 50 go to the second.
      const spread = await service.createSupplierPayment(
        {
          idempotencyKey: "spread-1",
          supplierId: "supplier-1",
          paidAt: new Date("2026-09-23T08:00:00.000Z"),
          amountTnd: "200.000",
        },
        actor,
      );

      await service.cancelPurchase(
        "purchase-1",
        { idempotencyKey: "cancel-1", reason: "Livraison refusée" },
        actor,
      );

      // The second purchase still owes 30: 80 less the 50 that stay paid.
      expect(balanceOf(prisma)).toBe("30.000");
      const payment = () =>
        prisma.store.supplierPayments.find(
          (row) => row.id === spread.payment.id,
        );
      // Still settling the second purchase: not marked as taken back.
      expect(payment()?.reversedAt ?? null).toBeNull();

      await service.reverseSupplierPayment(
        spread.payment.id,
        { idempotencyKey: "reverse-1", reason: "Erreur de saisie" },
        actor,
      );

      expect(prisma.store.supplierLedgerEntries.at(-1)).toMatchObject({
        entryType: "PAYMENT_REVERSAL",
        purchaseId: "purchase-2",
        paymentId: spread.payment.id,
        amountTnd: "50.000",
      });
      expect(balanceOf(prisma)).toBe("80.000");
      expect(payment()?.reversedAt).toBeInstanceOf(Date);
    });
  });
});

interface PaymentStore {
  suppliers: Array<{ id: string; isActive: boolean; name: string }>;
  purchases: Array<{
    id: string;
    supplierId: string;
    status: PurchaseStatus;
    reference?: string | null;
    purchaseDate: Date;
    totalTnd: string;
    paidAmountTnd: string;
    remainingDueTnd: string;
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
    reversedAt?: Date | null;
    reversedByUserId?: string | null;
    reversalReason?: string | null;
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
    $queryRaw: async () => [],
    stockLocation: {
      findUnique: async () => ({ id: "location-main", code: "main" }),
    },
    inventoryMovement: {
      createMany: async (args: { data: unknown[] }) => {
        store.inventoryMovements.push(...args.data);
        return { count: args.data.length };
      },
    },
    supplier: {
      findUnique: async (args: { where: { id: string } }) =>
        store.suppliers.find((supplier) => supplier.id === args.where.id) ??
        null,
    },
    supplierLedgerEntry: {
      findMany: async (args: {
        where: {
          supplierId?: string;
          purchaseId?: string;
          paymentId?: { in: string[] };
          entryType?: string | { in: string[] };
        };
      }) =>
        store.supplierLedgerEntries.filter(
          (entry) =>
            (args.where.supplierId === undefined ||
              entry.supplierId === args.where.supplierId) &&
            (args.where.purchaseId === undefined ||
              entry.purchaseId === args.where.purchaseId) &&
            (args.where.paymentId === undefined ||
              (entry.paymentId !== null &&
                args.where.paymentId.in.includes(entry.paymentId))) &&
            (args.where.entryType === undefined ||
              (typeof args.where.entryType === "string"
                ? entry.entryType === args.where.entryType
                : args.where.entryType.in.includes(entry.entryType))),
        ),
      // The service sums in SQL; the double mirrors a plain sum and a sum per
      // purchase id.
      aggregate: async (args: { where: { supplierId: string } }) => ({
        _sum: {
          amountTnd: store.supplierLedgerEntries
            .filter((entry) => entry.supplierId === args.where.supplierId)
            .reduce(
              (sum, entry) => sum.plus(entry.amountTnd),
              new Prisma.Decimal(0),
            ),
        },
      }),
      groupBy: async (args: {
        by: string[];
        where: {
          supplierId: string;
          purchaseId?: { in: string[] } | { not: null };
        };
      }) => {
        const groups = new Map<string, Prisma.Decimal>();
        for (const entry of store.supplierLedgerEntries) {
          if (
            entry.supplierId !== args.where.supplierId ||
            (args.where.purchaseId !== undefined &&
              (entry.purchaseId === null ||
                ("in" in args.where.purchaseId &&
                  !args.where.purchaseId.in.includes(entry.purchaseId))))
          ) {
            continue;
          }
          const key = entry.purchaseId ?? "";
          groups.set(
            key,
            (groups.get(key) ?? new Prisma.Decimal(0)).plus(entry.amountTnd),
          );
        }
        return [...groups.entries()].map(([purchaseId, amountTnd]) => ({
          purchaseId: purchaseId || null,
          _sum: { amountTnd },
        }));
      },
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
        // The payment taken at posting is seeded; later ones count from 1.
        const later = store.supplierPayments.filter(
          (row) => row.id !== "payment-initial",
        );
        const payment = {
          ...args.data,
          id: `payment-${later.length + 1}`,
        };
        store.supplierPayments.push(payment);
        return payment;
      },
      updateMany: async (args: {
        where: { id: { in: string[] }; reversedAt: null };
        data: Partial<PaymentStore["supplierPayments"][number]>;
      }) => {
        const rows = store.supplierPayments.filter(
          (row) => args.where.id.in.includes(row.id) && !row.reversedAt,
        );
        for (const row of rows) Object.assign(row, args.data);
        return { count: rows.length };
      },
      findUnique: async (args: { where: { id: string } }) => {
        const payment = store.supplierPayments.find(
          (row) => row.id === args.where.id,
        );
        return payment
          ? {
              ...payment,
              ledgerEntries: store.supplierLedgerEntries.filter(
                (entry) => entry.paymentId === payment.id,
              ),
            }
          : null;
      },
      update: async (args: {
        where: { id: string };
        data: Partial<PaymentStore["supplierPayments"][number]>;
      }) => {
        const payment = store.supplierPayments.find(
          (row) => row.id === args.where.id,
        );
        if (!payment) throw new Error("missing payment");
        Object.assign(payment, args.data);
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
          supplierId?: string;
          status?: PurchaseStatus;
        };
      }) =>
        store.purchases
          .filter(
            (purchase) =>
              args.where.id.in.includes(purchase.id) &&
              (args.where.supplierId === undefined ||
                purchase.supplierId === args.where.supplierId) &&
              (args.where.status === undefined ||
                purchase.status === args.where.status),
          )
          .sort(
            (left, right) =>
              left.purchaseDate.getTime() - right.purchaseDate.getTime(),
          ),
      findUnique: async (args: { where: { id: string } }) => {
        const purchase = store.purchases.find(
          (row) => row.id === args.where.id,
        );
        return purchase
          ? {
              ...purchase,
              supplier: store.suppliers[0],
              lines: [],
              payments: store.supplierPayments.filter(
                (payment) => payment.purchaseId === purchase.id,
              ),
              ledgerEntries: [],
            }
          : null;
      },
      update: async (args: {
        where: { id: string };
        data: Partial<PaymentStore["purchases"][number]>;
      }) => {
        const purchase = store.purchases.find(
          (row) => row.id === args.where.id,
        );
        if (!purchase) throw new Error("missing purchase");
        Object.assign(purchase, args.data);
        return { ...purchase, supplier: store.suppliers[0], lines: [] };
      },
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
        reference: "AC-000001",
        supplierId: "supplier-1",
        status: PurchaseStatus.POSTED,
        purchaseDate: new Date("2026-09-20T08:00:00.000Z"),
        totalTnd: "250.000",
        paidAmountTnd: "100.000",
        remainingDueTnd: "150.000",
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
