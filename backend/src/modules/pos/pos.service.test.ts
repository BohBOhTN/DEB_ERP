import {
  PosSessionStatus,
  type PrismaClient,
  type SalePaymentMethod,
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
});

interface PosStore {
  posTerminals: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  }>;
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
    inventoryMovements: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

function makeTransactionClient(store: PosStore) {
  return {
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
    salePayment: {
      findMany: async (args: { where: { sessionId: string } }) =>
        store.salePayments.filter(
          (payment) => payment.sessionId === args.where.sessionId,
        ),
      create: async (args: { data: Record<string, unknown> }) => {
        const payment = {
          id: `payment-${store.salePayments.length + 1}`,
          method: "CASH" satisfies SalePaymentMethod,
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
