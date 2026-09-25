import {
  PosSessionStatus,
  type PrismaClient,
  type PaymentMethod,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PosService } from "./pos.service.js";

describe("PosService", () => {
  it("opens one POS session and returns the same response on retry", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    const payload = {
      idempotencyKey: "open-1",
      openingCashTnd: "20.000",
      openedAt: new Date("2026-09-21T08:00:00.000Z"),
    };

    const first = await service.openSession(payload, { actorUserId: "user-1" });
    const retry = await service.openSession(payload, { actorUserId: "user-1" });

    expect(first.session.id).toBe("session-1");
    expect(retry.session.id).toBe("session-1");
    expect(prisma.store.posSessions).toHaveLength(1);
  });

  it("rejects opening a second active POS session", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);

    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.openSession(
        {
          idempotencyKey: "open-2",
          openingCashTnd: "10.000",
          openedAt: new Date("2026-09-21T08:05:00.000Z"),
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "POS_SESSION_ALREADY_OPEN",
    });
  });

  it("posts a paid sale with payment, stock movement, audit, and idempotent retry", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    const payload = {
      idempotencyKey: "sale-1",
      sessionId: "session-1",
      soldAt: new Date("2026-09-21T08:10:00.000Z"),
      lines: [
        {
          productId: "product-1",
          quantity: "2",
        },
      ],
    };

    const first = await service.postPaidSale(payload, {
      actorUserId: "user-1",
      correlationId: "correlation-1",
    });
    const retry = await service.postPaidSale(payload, {
      actorUserId: "user-1",
      correlationId: "correlation-1",
    });

    expect(first.sale).toMatchObject({
      id: "sale-1",
      totalTnd: "5.000",
      paidAmountTnd: "5.000",
      paymentState: "PAID",
    });
    expect(retry.sale.id).toBe("sale-1");
    expect(prisma.store.sales).toHaveLength(1);
    expect(prisma.store.salePayments).toEqual([
      expect.objectContaining({
        saleId: "sale-1",
        sessionId: "session-1",
        amountTnd: "5.000",
      }),
    ]);
    expect(prisma.store.inventoryMovements).toEqual([
      expect.objectContaining({
        productId: "product-1",
        movementType: "POS_SALE",
        quantityDelta: "-2.000000",
        sourceId: "sale-1",
      }),
    ]);
    expect(prisma.store.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "pos_sale.post" }),
      ]),
    );
  });

  it("posts a partial customer sale with receivable and actual cash only", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    const result = await service.postPaidSale(
      {
        idempotencyKey: "sale-credit-1",
        sessionId: "session-1",
        customerId: "customer-1",
        soldAt: new Date("2026-09-21T08:10:00.000Z"),
        paidAmountTnd: "2.000",
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.sale).toMatchObject({
      totalTnd: "5.000",
      paidAmountTnd: "2.000",
      remainingDueTnd: "3.000",
      paymentState: "PARTIALLY_PAID",
      customerId: "customer-1",
    });
    expect(prisma.store.salePayments).toEqual([
      expect.objectContaining({
        amountTnd: "2.000",
      }),
    ]);
    expect(prisma.store.customerLedgerEntries).toEqual([
      expect.objectContaining({
        customerId: "customer-1",
        saleId: "sale-1",
        entryType: "SALE_RECEIVABLE",
        amountTnd: "3.000",
      }),
    ]);
  });

  // Issue #43: a cashier without pos.credit_sale posts a fully paid sale
  // and is refused only when a remainder would be left on the customer.
  it("needs the credit permission only when a remainder is left", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    const lines = [{ productId: "product-1", quantity: "2" }];

    const paid = await service.postPaidSale(
      {
        idempotencyKey: "sale-paid",
        sessionId: "session-1",
        soldAt: new Date("2026-09-21T08:10:00.000Z"),
        paidAmountTnd: "5.000",
        creditAllowed: false,
        lines,
      },
      { actorUserId: "user-1" },
    );
    expect(paid.sale).toMatchObject({ paymentState: "PAID" });

    await expect(
      service.postPaidSale(
        {
          idempotencyKey: "sale-credit",
          sessionId: "session-1",
          customerId: "customer-1",
          soldAt: new Date("2026-09-21T08:10:00.000Z"),
          paidAmountTnd: "2.000",
          creditAllowed: false,
          lines,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(prisma.store.sales).toHaveLength(1);
  });

  it("rejects anonymous customer credit", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.postPaidSale(
        {
          idempotencyKey: "sale-credit-1",
          sessionId: "session-1",
          soldAt: new Date("2026-09-21T08:10:00.000Z"),
          paidAmountTnd: "2.000",
          lines: [
            {
              productId: "product-1",
              quantity: "2",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "CUSTOMER_REQUIRED_FOR_CREDIT",
    });
  });

  it("rejects reusing a sale idempotency key with different cart content", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    await service.postPaidSale(
      {
        idempotencyKey: "sale-1",
        sessionId: "session-1",
        soldAt: new Date("2026-09-21T08:10:00.000Z"),
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.postPaidSale(
        {
          idempotencyKey: "sale-1",
          sessionId: "session-1",
          soldAt: new Date("2026-09-21T08:10:00.000Z"),
          lines: [
            {
              productId: "product-1",
              quantity: "3",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("closes a POS session with expected cash and difference", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    await service.postPaidSale(
      {
        idempotencyKey: "sale-1",
        sessionId: "session-1",
        soldAt: new Date("2026-09-21T08:10:00.000Z"),
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    const result = await service.closeSession(
      "session-1",
      {
        idempotencyKey: "close-1",
        countedCashTnd: "30.000",
        closedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    expect(result.session).toMatchObject({
      status: PosSessionStatus.CLOSED,
      expectedCashTnd: "25.000",
      countedCashTnd: "30.000",
      cashDifferenceTnd: "5.000",
    });
  });

  it("counts order advances and refunds in expected closing cash", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    prisma.store.customerOrderAdvances.push(
      { sessionId: "session-1", movement: "RECEIPT", amountTnd: "10.000" },
      { sessionId: "session-1", movement: "REFUND", amountTnd: "4.000" },
    );
    // A back-office customer payment carries no session and must not count.
    prisma.store.customerPayments.push({
      sessionId: null,
      amountTnd: "99.000",
    });

    const result = await service.closeSession(
      "session-1",
      {
        idempotencyKey: "close-1",
        countedCashTnd: "26.000",
        closedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    expect(result.session).toMatchObject({
      expectedCashTnd: "26.000",
      cashDifferenceTnd: "0.000",
    });
  });

  it("counts customer payments collected at the till in expected closing cash", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    prisma.store.customerPayments.push(
      { sessionId: "session-1", amountTnd: "15.000" },
      // Collected in the back office, so it is not drawer cash.
      { sessionId: null, amountTnd: "40.000" },
    );

    const result = await service.closeSession(
      "session-1",
      {
        idempotencyKey: "close-1",
        countedCashTnd: "35.000",
        closedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    expect(result.session).toMatchObject({
      expectedCashTnd: "35.000",
      cashDifferenceTnd: "0.000",
    });
  });

  // A règlement taken at an earlier till and reversed during this session
  // is cash handed back from this drawer.
  it("subtracts customer payments reversed during the session from expected cash", async () => {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    prisma.store.customerPayments.push(
      { sessionId: "session-1", amountTnd: "15.000" },
      {
        sessionId: "session-0",
        amountTnd: "9.000",
        reversedInSessionId: "session-1",
      },
    );

    const result = await service.closeSession(
      "session-1",
      {
        idempotencyKey: "close-1",
        countedCashTnd: "26.000",
        closedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    expect(result.session).toMatchObject({
      expectedCashTnd: "26.000",
      cashDifferenceTnd: "0.000",
    });
  });
});

describe("PosService sale cancellation (issue #44)", () => {
  async function serviceWithPostedSale(
    paidAmountTnd: string,
    customerId?: string,
  ) {
    const prisma = new PosPrismaDouble();
    const service = new PosService(prisma as unknown as PrismaClient);
    await service.openSession(
      {
        idempotencyKey: "open-1",
        openingCashTnd: "20.000",
        openedAt: new Date("2026-09-21T08:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    const { sale } = await service.postPaidSale(
      {
        idempotencyKey: "sale-1",
        sessionId: "session-1",
        customerId,
        soldAt: new Date("2026-09-21T08:10:00.000Z"),
        paidAmountTnd,
        lines: [{ productId: "product-1", quantity: "2" }],
      },
      { actorUserId: "user-1" },
    );
    return { prisma, service, sale };
  }

  it("cancels a cash sale: refund in the open drawer, stock back, sale kept as cancelled", async () => {
    const { prisma, service, sale } = await serviceWithPostedSale("5.000");

    const result = await service.cancelSale(
      sale.id,
      { idempotencyKey: "cancel-1", reason: "Erreur de saisie" },
      { actorUserId: "user-2" },
    );

    expect(result.sale).toMatchObject({
      status: "CANCELLED",
      cancelledByUserId: "user-2",
      cancellationReason: "Erreur de saisie",
      reference: sale.reference,
      totalTnd: "5.000",
    });
    expect(prisma.store.salePayments).toEqual([
      expect.objectContaining({ movement: "RECEIPT", amountTnd: "5.000" }),
      expect.objectContaining({
        movement: "REFUND",
        amountTnd: "5.000",
        sessionId: "session-1",
        saleId: sale.id,
      }),
    ]);
    expect(prisma.store.inventoryMovements.at(-1)).toMatchObject({
      movementType: "REVERSAL",
      quantityDelta: "2.000000",
      sourceType: "POS_SALE_CANCELLATION",
      sourceId: sale.id,
      reason: "Erreur de saisie",
    });
    expect(prisma.store.auditEvents.at(-1)).toMatchObject({
      action: "pos_sale.cancel",
    });

    // The drawer expects its opening cash only: the refund undid the receipt.
    const closed = await service.closeSession(
      "session-1",
      {
        idempotencyKey: "close-1",
        countedCashTnd: "20.000",
        closedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );
    expect(closed.session).toMatchObject({
      expectedCashTnd: "20.000",
      cashDifferenceTnd: "0.000",
    });

    await expect(
      service.cancelSale(
        sale.id,
        { idempotencyKey: "cancel-2", reason: "Encore" },
        { actorUserId: "user-2" },
      ),
    ).rejects.toMatchObject({ code: "SALE_ALREADY_CANCELLED" });
  });

  it("cancels a credit sale by reversing the customer's receivable", async () => {
    const { prisma, service, sale } = await serviceWithPostedSale(
      "2.000",
      "customer-1",
    );

    await service.cancelSale(
      sale.id,
      { idempotencyKey: "cancel-1", reason: "Client parti" },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.customerLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "SALE_RECEIVABLE",
        amountTnd: "3.000",
      }),
      expect.objectContaining({
        entryType: "SALE_REVERSAL",
        amountTnd: "-3.000",
        saleId: sale.id,
        balanceKind: "RECEIVABLE",
      }),
    ]);
  });

  it("needs an open drawer to refund the cash of a sale", async () => {
    const { prisma, service, sale } = await serviceWithPostedSale("5.000");
    await service.closeSession(
      "session-1",
      {
        idempotencyKey: "close-1",
        countedCashTnd: "25.000",
        closedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.cancelSale(
        sale.id,
        { idempotencyKey: "cancel-1", reason: "Erreur de saisie" },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "POS_SESSION_NOT_OPEN" });
    expect(prisma.store.sales[0]).toMatchObject({ status: "POSTED" });
  });

  it("refuses a sale created by an order or one that received règlements", async () => {
    const { prisma, service, sale } = await serviceWithPostedSale(
      "2.000",
      "customer-1",
    );
    const row = prisma.store.sales[0] as Record<string, unknown>;

    row.order = { id: "order-1", reference: "CMD-000001" };
    await expect(
      service.cancelSale(
        sale.id,
        { idempotencyKey: "cancel-order", reason: "Erreur" },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "SALE_LINKED_TO_ORDER" });

    row.order = null;
    row.paymentAllocations = [{ payment: { reversedAt: null } }];
    await expect(
      service.cancelSale(
        sale.id,
        { idempotencyKey: "cancel-paid", reason: "Erreur" },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "SALE_HAS_ALLOCATED_PAYMENTS" });

    // A reversed règlement no longer blocks.
    row.paymentAllocations = [{ payment: { reversedAt: new Date() } }];
    const result = await service.cancelSale(
      sale.id,
      { idempotencyKey: "cancel-ok", reason: "Erreur de saisie" },
      { actorUserId: "user-1" },
    );
    expect(result.sale.status).toBe("CANCELLED");
  });

  it("returns the same cancellation on an idempotent retry", async () => {
    const { prisma, service, sale } = await serviceWithPostedSale("5.000");
    const params = { idempotencyKey: "cancel-1", reason: "Erreur de saisie" };

    await service.cancelSale(sale.id, params, { actorUserId: "user-1" });
    await service.cancelSale(sale.id, params, { actorUserId: "user-1" });

    expect(
      prisma.store.salePayments.filter((row) => row.movement === "REFUND"),
    ).toHaveLength(1);
  });
});

interface PosStore {
  posTerminals: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  }>;
  customers: Array<{ id: string; isActive: boolean; name: string }>;
  posSessions: Array<Record<string, unknown>>;
  products: Array<{
    id: string;
    name: string;
    baseUnitId: string;
    salePriceTnd: string;
    isActive: boolean;
    isStockable: boolean;
    baseUnit: { id: string; name: string };
  }>;
  stockLocations: Array<{ id: string; code: string }>;
  sales: Array<Record<string, unknown>>;
  saleLines: Array<Record<string, unknown>>;
  salePayments: Array<Record<string, unknown>>;
  customerOrderAdvances: Array<Record<string, unknown>>;
  customerPayments: Array<Record<string, unknown>>;
  customerLedgerEntries: Array<Record<string, unknown>>;
  inventoryMovements: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
  idempotencyRecords: Array<{
    scope: string;
    key: string;
    requestHash: string;
    response: unknown;
  }>;
}

class PosPrismaDouble {
  public store = createStore();

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
    action: (tx: ReturnType<typeof makeTransactionClient>) => Promise<TResult>,
  ): Promise<TResult> {
    const staged = structuredClone(this.store) as PosStore;
    const result = await action(makeTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function createStore(): PosStore {
  return {
    posTerminals: [
      {
        id: "terminal-1",
        code: "main",
        name: "Caisse principale",
        isActive: true,
      },
    ],
    customers: [{ id: "customer-1", isActive: true, name: "Client Test" }],
    posSessions: [],
    products: [
      {
        id: "product-1",
        name: "Baguette",
        baseUnitId: "unit-piece",
        salePriceTnd: "2.500",
        isActive: true,
        isStockable: true,
        baseUnit: {
          id: "unit-piece",
          name: "Piece",
        },
      },
    ],
    stockLocations: [{ id: "location-1", code: "main" }],
    sales: [],
    saleLines: [],
    salePayments: [],
    customerOrderAdvances: [],
    customerPayments: [],
    customerLedgerEntries: [],
    inventoryMovements: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

function makeTransactionClient(store: PosStore) {
  let sequence = 0;
  return {
    // Sale numbers come from a database sequence.
    $queryRawUnsafe: async () => [{ nextval: BigInt(++sequence) }],
    // The row lock has no effect in a single-threaded double.
    $queryRaw: async () => [],
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
      },
    },
    posTerminal: {
      findUnique: async (args: { where: { code: string } }) =>
        store.posTerminals.find(
          (terminal) => terminal.code === args.where.code,
        ) ?? null,
    },
    posSession: {
      findFirst: async (args: {
        where: { terminalId?: string; status: PosSessionStatus };
      }) =>
        store.posSessions.find(
          (session) =>
            session.status === args.where.status &&
            (!args.where.terminalId ||
              session.terminalId === args.where.terminalId),
        ) ?? null,
      findUnique: async (args: { where: { id: string } }) =>
        store.posSessions.find((session) => session.id === args.where.id) ??
        null,
      create: async (args: { data: Record<string, unknown> }) => {
        const session = {
          id: `session-${store.posSessions.length + 1}`,
          status: PosSessionStatus.OPEN,
          ...args.data,
        };
        store.posSessions.push(session);
        return withTerminal(store, session);
      },
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const session = store.posSessions.find(
          (item) => item.id === args.where.id,
        );

        if (!session) {
          throw new Error("missing session");
        }

        Object.assign(session, args.data);
        return withTerminal(store, session);
      },
    },
    customerOrderAdvance: {
      findMany: async (args: { where: { sessionId: string } }) =>
        store.customerOrderAdvances.filter(
          (advance) => advance.sessionId === args.where.sessionId,
        ),
      // Session close sums per movement kind in SQL.
      groupBy: async (args: { where: { sessionId: string } }) => {
        const totals = new Map<string, number>();
        for (const advance of store.customerOrderAdvances) {
          if (advance.sessionId !== args.where.sessionId) continue;
          const movement = String(advance.movement);
          totals.set(
            movement,
            (totals.get(movement) ?? 0) + Number(advance.amountTnd),
          );
        }
        return [...totals.entries()].map(([movement, amount]) => ({
          movement,
          _sum: { amountTnd: amount.toFixed(3) },
        }));
      },
    },
    customerPayment: {
      findMany: async (args: { where: { sessionId: string } }) =>
        store.customerPayments.filter(
          (payment) => payment.sessionId === args.where.sessionId,
        ),
      aggregate: async (args: {
        where: { sessionId?: string; reversedInSessionId?: string };
      }) => ({
        _sum: {
          amountTnd: store.customerPayments
            .filter((payment) =>
              args.where.reversedInSessionId !== undefined
                ? payment.reversedInSessionId === args.where.reversedInSessionId
                : payment.sessionId === args.where.sessionId,
            )
            .reduce((sum, payment) => sum + Number(payment.amountTnd), 0)
            .toFixed(3),
        },
      }),
    },
    salePayment: {
      findMany: async (args: { where: { sessionId: string } }) =>
        store.salePayments.filter(
          (payment) => payment.sessionId === args.where.sessionId,
        ),
      // Session cash sums receipts and refunds separately in SQL.
      groupBy: async (args: { where: { sessionId: string } }) => {
        const totals = new Map<string, number>();
        for (const payment of store.salePayments) {
          if (payment.sessionId !== args.where.sessionId) continue;
          const movement = String(payment.movement ?? "RECEIPT");
          totals.set(
            movement,
            (totals.get(movement) ?? 0) + Number(payment.amountTnd),
          );
        }
        return [...totals.entries()].map(([movement, amount]) => ({
          movement,
          _sum: { amountTnd: amount.toFixed(3) },
        }));
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const payment = {
          id: `payment-${store.salePayments.length + 1}`,
          method: "CASH" satisfies PaymentMethod,
          movement: "RECEIPT",
          ...args.data,
        };
        store.salePayments.push(payment);
        return payment;
      },
    },
    product: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        store.products.filter((product) =>
          args.where.id.in.includes(product.id),
        ),
    },
    customer: {
      findUnique: async (args: { where: { id: string } }) =>
        store.customers.find((customer) => customer.id === args.where.id) ??
        null,
    },
    sale: {
      create: async (args: {
        data: Record<string, unknown> & {
          lines: { createMany: { data: Array<Record<string, unknown>> } };
        };
      }) => {
        const { lines, ...saleData } = args.data;
        const sale = {
          id: `sale-${store.sales.length + 1}`,
          ...saleData,
        };
        store.sales.push(sale);
        lines.createMany.data.forEach((line) => {
          store.saleLines.push({
            id: `line-${store.saleLines.length + 1}`,
            saleId: sale.id,
            ...line,
          });
        });

        return { ...sale, lines: getSaleLines(store, sale.id), payments: [] };
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const sale = store.sales.find((item) => item.id === args.where.id);

        if (!sale) {
          throw new Error("missing sale");
        }

        return {
          ...sale,
          lines: getSaleLines(store, sale.id),
          payments: store.salePayments.filter(
            (payment) => payment.saleId === sale.id,
          ),
        };
      },
      // Cancellation reads the sale with its lines' stockable flag, its
      // payments, its order and the règlements allocated to it.
      findUnique: async (args: { where: { id: string } }) => {
        const sale = store.sales.find((item) => item.id === args.where.id);
        if (!sale) return null;
        return {
          ...sale,
          lines: getSaleLines(store, sale.id).map((line) => ({
            ...line,
            product: {
              isStockable:
                store.products.find((product) => product.id === line.productId)
                  ?.isStockable ?? false,
            },
          })),
          payments: store.salePayments
            .filter((payment) => payment.saleId === sale.id)
            .map((payment) => ({ movement: "RECEIPT", ...payment })),
          order: (sale.order as unknown) ?? null,
          paymentAllocations: (sale.paymentAllocations as unknown[]) ?? [],
        };
      },
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const sale = store.sales.find((item) => item.id === args.where.id);
        if (!sale) throw new Error("missing sale");
        Object.assign(sale, args.data);
        return {
          ...sale,
          lines: getSaleLines(store, sale.id),
          payments: store.salePayments.filter(
            (payment) => payment.saleId === sale.id,
          ),
        };
      },
    },
    stockLocation: {
      findUnique: async (args: { where: { code: string } }) =>
        store.stockLocations.find(
          (location) => location.code === args.where.code,
        ) ?? null,
    },
    inventoryMovement: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        store.inventoryMovements.push(...args.data);
      },
    },
    customerLedgerEntry: {
      create: async (args: { data: Record<string, unknown> }) => {
        store.customerLedgerEntries.push({
          id: `customer-ledger-${store.customerLedgerEntries.length + 1}`,
          ...args.data,
        });
      },
    },
    auditEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        store.auditEvents.push(args.data);
      },
    },
  };
}

function withTerminal(store: PosStore, session: Record<string, unknown>) {
  return {
    ...session,
    terminal:
      store.posTerminals.find(
        (terminal) => terminal.id === session.terminalId,
      ) ?? null,
  };
}

function getSaleLines(store: PosStore, saleId: unknown) {
  return store.saleLines.filter((line) => line.saleId === saleId);
}
