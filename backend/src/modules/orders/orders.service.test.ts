import {
  CustomerOrderAdvanceDisposition,
  CustomerOrderStatus,
  PosSessionStatus,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { OrdersService } from "./orders.service.js";

const fulfillmentAt = new Date("2026-09-23T09:00:00.000Z");
const orderedAt = new Date("2026-09-22T09:00:00.000Z");
const completedAt = new Date("2026-09-23T09:15:00.000Z");

describe("OrdersService", () => {
  it("creates an order without revenue, payment, or stock movement", async () => {
    const { service, prisma } = makeService();

    const { order } = await createConfirmedOrder(service);

    expect(order).toMatchObject({
      reference: "CMD-000001",
      customerId: "customer-1",
      totalTnd: "40.000",
      advanceBalanceTnd: "0",
    });
    expect(prisma.store.sales).toHaveLength(0);
    expect(prisma.store.salePayments).toHaveLength(0);
    expect(prisma.store.inventoryMovements).toHaveLength(0);
    expect(prisma.store.customerLedgerEntries).toHaveLength(0);
  });

  // AS-009: a 40.000 TND order with a 10.000 TND deposit creates no revenue and
  // no stock movement, and records a 10.000 TND customer advance.
  it("records a deposit as customer advance only", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);

    const result = await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    expect(result.order.advanceBalanceTnd).toBe("10.000");
    expect(prisma.store.sales).toHaveLength(0);
    expect(prisma.store.inventoryMovements).toHaveLength(0);
    expect(prisma.store.customerOrderAdvances).toEqual([
      expect.objectContaining({
        orderId: order.id,
        sessionId: "session-1",
        movement: "RECEIPT",
        amountTnd: "10.000",
      }),
    ]);
    expect(prisma.store.customerLedgerEntries).toEqual([
      expect.objectContaining({
        customerId: "customer-1",
        orderId: order.id,
        balanceKind: "ADVANCE",
        entryType: "ORDER_ADVANCE",
        amountTnd: "10.000",
      }),
    ]);
  });

  // ORD-016: total advances cannot exceed the order total.
  it("rejects an advance above the order total", async () => {
    const { service } = makeService();
    const { order } = await createConfirmedOrder(service);

    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "30.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.recordOrderAdvance(
        order.id,
        {
          idempotencyKey: "advance-2",
          amountTnd: "20.000",
          paidAt: orderedAt,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_ADVANCE_EXCEEDS_TOTAL",
    });
  });

  // AS-010: completing the 40.000 TND order creates one linked sale, applies
  // the 10.000 TND advance, reduces stock, recognizes 40.000 TND once, and
  // leaves 30.000 TND receivable when nothing more is paid.
  it("completes an order into one linked sale with advance applied", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    const result = await service.completeOrder(
      order.id,
      {
        idempotencyKey: "complete-1",
        completedAt,
        paidAmountTnd: "0",
      },
      { actorUserId: "user-1" },
    );

    expect(result.order).toMatchObject({
      status: CustomerOrderStatus.COMPLETED,
      saleId: "sale-1",
      advanceBalanceTnd: "0",
    });
    expect(prisma.store.sales).toEqual([
      expect.objectContaining({
        id: "sale-1",
        customerId: "customer-1",
        totalTnd: "40.000",
        paidAmountTnd: "10.000",
        remainingDueTnd: "30.000",
        paymentState: "PARTIALLY_PAID",
      }),
    ]);
    // No completion payment was collected, so no new cash entered the drawer.
    expect(prisma.store.salePayments).toHaveLength(0);
    expect(prisma.store.inventoryMovements).toEqual([
      expect.objectContaining({
        productId: "product-1",
        movementType: "POS_SALE",
        quantityDelta: "-16.000000",
        sourceId: "sale-1",
      }),
    ]);
    expect(prisma.store.customerLedgerEntries).toEqual([
      expect.objectContaining({
        balanceKind: "ADVANCE",
        entryType: "ORDER_ADVANCE",
        amountTnd: "10.000",
      }),
      expect.objectContaining({
        balanceKind: "ADVANCE",
        entryType: "ORDER_ADVANCE_APPLIED",
        saleId: "sale-1",
        amountTnd: "-10.000",
      }),
      expect.objectContaining({
        balanceKind: "RECEIVABLE",
        entryType: "SALE_RECEIVABLE",
        saleId: "sale-1",
        amountTnd: "30.000",
      }),
    ]);
  });

  it("records only the completion payment as drawer cash", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    await service.completeOrder(
      order.id,
      {
        idempotencyKey: "complete-1",
        completedAt,
      },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.sales[0]).toMatchObject({
      paidAmountTnd: "40.000",
      remainingDueTnd: "0.000",
      paymentState: "PAID",
    });
    expect(prisma.store.salePayments).toEqual([
      expect.objectContaining({
        saleId: "sale-1",
        sessionId: "session-1",
        amountTnd: "30.000",
      }),
    ]);
  });

  it("rejects a completion paying more than the order total", async () => {
    const { service } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.completeOrder(
        order.id,
        {
          idempotencyKey: "complete-1",
          completedAt,
          paidAmountTnd: "35.000",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SALE_OVERPAYMENT_REJECTED",
    });
  });

  // AS-011: a retry and a second completion attempt must not create a second
  // linked sale.
  it("completes an order only once", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);
    const payload = {
      idempotencyKey: "complete-1",
      completedAt,
    };

    const first = await service.completeOrder(order.id, payload, {
      actorUserId: "user-1",
    });
    const retry = await service.completeOrder(order.id, payload, {
      actorUserId: "user-1",
    });

    expect(first.order.saleId).toBe("sale-1");
    expect(retry.order.saleId).toBe("sale-1");
    expect(prisma.store.sales).toHaveLength(1);

    await expect(
      service.completeOrder(
        order.id,
        {
          idempotencyKey: "complete-2",
          completedAt,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_COMPLETABLE",
    });
    expect(prisma.store.sales).toHaveLength(1);
  });

  it("refuses to complete an order while the POS session is closed", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);
    prisma.store.posSessions[0].status = PosSessionStatus.CLOSED;

    await expect(
      service.completeOrder(
        order.id,
        {
          idempotencyKey: "complete-1",
          completedAt,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "POS_SESSION_NOT_OPEN",
    });
  });

  // AS-012: cancelling an order that holds an advance requires a reason and an
  // explicit refund or customer-credit outcome.
  it("rejects cancelling an order with an advance and no disposition", async () => {
    const { service } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.cancelOrder(
        order.id,
        {
          idempotencyKey: "cancel-1",
          cancelledAt: completedAt,
          reason: "Client absent",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_ADVANCE_DISPOSITION_REQUIRED",
    });
  });

  it("refunds an advance out of the open session on cancellation", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    const result = await service.cancelOrder(
      order.id,
      {
        idempotencyKey: "cancel-1",
        cancelledAt: completedAt,
        reason: "Client absent",
        advanceDisposition: CustomerOrderAdvanceDisposition.REFUNDED,
      },
      { actorUserId: "user-1" },
    );

    expect(result.order).toMatchObject({
      status: CustomerOrderStatus.CANCELLED,
      cancellationReason: "Client absent",
      advanceDisposition: "REFUNDED",
      advanceBalanceTnd: "0",
    });
    expect(prisma.store.customerOrderAdvances).toContainEqual(
      expect.objectContaining({
        movement: "REFUND",
        sessionId: "session-1",
        amountTnd: "10.000",
      }),
    );
    expect(prisma.store.customerLedgerEntries).toContainEqual(
      expect.objectContaining({
        balanceKind: "ADVANCE",
        entryType: "ORDER_ADVANCE_REFUNDED",
        amountTnd: "-10.000",
      }),
    );
    // A refund is not revenue and does not become a receivable.
    expect(prisma.store.sales).toHaveLength(0);
  });

  it("keeps a cancelled advance as customer credit when chosen", async () => {
    const { service, prisma } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "10.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    await service.cancelOrder(
      order.id,
      {
        idempotencyKey: "cancel-1",
        cancelledAt: completedAt,
        reason: "Commande annulée",
        advanceDisposition: CustomerOrderAdvanceDisposition.CREDITED,
      },
      { actorUserId: "user-1" },
    );

    // The advance is cleared and the same amount becomes customer credit
    // against the receivable balance. No cash leaves the drawer.
    expect(prisma.store.customerLedgerEntries).toContainEqual(
      expect.objectContaining({
        balanceKind: "ADVANCE",
        entryType: "ORDER_ADVANCE_CREDITED",
        amountTnd: "-10.000",
      }),
    );
    expect(prisma.store.customerLedgerEntries).toContainEqual(
      expect.objectContaining({
        balanceKind: "RECEIVABLE",
        entryType: "ORDER_ADVANCE_CREDITED",
        amountTnd: "-10.000",
      }),
    );
    expect(
      prisma.store.customerOrderAdvances.filter(
        (advance) => advance.movement === "REFUND",
      ),
    ).toHaveLength(0);
  });

  it("rejects completing a cancelled order", async () => {
    const { service } = makeService();
    const { order } = await createConfirmedOrder(service);
    await service.cancelOrder(
      order.id,
      {
        idempotencyKey: "cancel-1",
        cancelledAt: completedAt,
        reason: "Erreur de saisie",
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.completeOrder(
        order.id,
        {
          idempotencyKey: "complete-1",
          completedAt,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_COMPLETABLE",
    });
  });

  it("rejects a draft order completion", async () => {
    const { service } = makeService();
    const created = await service.createOrder(
      {
        idempotencyKey: "order-1",
        customerId: "customer-1",
        requestedFulfillmentAt: fulfillmentAt,
        lines: [{ productId: "product-1", quantity: "16" }],
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.completeOrder(
        created.order.id,
        {
          idempotencyKey: "complete-1",
          completedAt,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_COMPLETABLE",
    });
  });

  // ORD-017: money already received cannot be stranded by shrinking the order.
  it("rejects reducing an order total below the advance received", async () => {
    const { service } = makeService();
    const { order } = await createConfirmedOrder(service);
    const withAdvance = await service.recordOrderAdvance(
      order.id,
      {
        idempotencyKey: "advance-1",
        amountTnd: "30.000",
        paidAt: orderedAt,
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.updateOrder(
        order.id,
        {
          version: withAdvance.order.version,
          lines: [{ productId: "product-1", quantity: "4" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_TOTAL_BELOW_ADVANCE",
    });
  });

  it("rejects an unsupported status transition", async () => {
    const { service } = makeService();
    const { order } = await createConfirmedOrder(service);

    await expect(
      service.changeOrderStatus(
        order.id,
        {
          version: order.version,
          status: CustomerOrderStatus.READY,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ORDER_STATUS_TRANSITION_INVALID",
    });
  });

  it("rejects an order for an inactive customer", async () => {
    const { service, prisma } = makeService();
    prisma.store.customers[0].isActive = false;

    await expect(
      service.createOrder(
        {
          idempotencyKey: "order-1",
          customerId: "customer-1",
          requestedFulfillmentAt: fulfillmentAt,
          lines: [{ productId: "product-1", quantity: "16" }],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ACTIVE_CUSTOMER_REQUIRED",
    });
  });
});

async function createConfirmedOrder(service: OrdersService) {
  const created = await service.createOrder(
    {
      idempotencyKey: "order-1",
      customerId: "customer-1",
      requestedFulfillmentAt: fulfillmentAt,
      lines: [{ productId: "product-1", quantity: "16" }],
    },
    { actorUserId: "user-1" },
  );

  return service.changeOrderStatus(
    created.order.id,
    {
      version: created.order.version,
      status: CustomerOrderStatus.CONFIRMED,
    },
    { actorUserId: "user-1" },
  );
}

function makeService() {
  const prisma = new OrdersPrismaDouble();
  const service = new OrdersService(prisma as unknown as PrismaClient);

  return { prisma, service };
}

type Row = Record<string, unknown>;

interface OrdersStore {
  referenceSequence: number;
  customers: Array<{ id: string; isActive: boolean; name: string }>;
  products: Array<{
    id: string;
    name: string;
    baseUnitId: string;
    salePriceTnd: string;
    isActive: boolean;
    isStockable: boolean;
    baseUnit: { id: string; name: string };
  }>;
  posSessions: Array<{ id: string; status: PosSessionStatus }>;
  stockLocations: Array<{ id: string; code: string }>;
  customerOrders: Row[];
  customerOrderLines: Row[];
  customerOrderAdvances: Row[];
  customerLedgerEntries: Row[];
  sales: Row[];
  saleLines: Row[];
  salePayments: Row[];
  inventoryMovements: Row[];
  auditEvents: Row[];
  idempotencyRecords: Array<{
    scope: string;
    key: string;
    requestHash: string;
    response: unknown;
  }>;
}

class OrdersPrismaDouble {
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
    const staged = structuredClone(this.store) as OrdersStore;
    const result = await action(makeTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function createStore(): OrdersStore {
  return {
    referenceSequence: 0,
    customers: [{ id: "customer-1", isActive: true, name: "Client Test" }],
    products: [
      {
        id: "product-1",
        name: "Baguette",
        baseUnitId: "unit-piece",
        salePriceTnd: "2.500",
        isActive: true,
        isStockable: true,
        baseUnit: { id: "unit-piece", name: "Piece" },
      },
    ],
    posSessions: [{ id: "session-1", status: PosSessionStatus.OPEN }],
    stockLocations: [{ id: "location-1", code: "main" }],
    customerOrders: [],
    customerOrderLines: [],
    customerOrderAdvances: [],
    customerLedgerEntries: [],
    sales: [],
    saleLines: [],
    salePayments: [],
    inventoryMovements: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

function makeTransactionClient(store: OrdersStore) {
  const findOrder = (id: unknown) =>
    store.customerOrders.find((order) => order.id === id);
  const hydrate = (order: Row) => ({
    ...order,
    customer:
      store.customers.find((customer) => customer.id === order.customerId) ??
      null,
    lines: store.customerOrderLines.filter((line) => line.orderId === order.id),
    advances: store.customerOrderAdvances.filter(
      (advance) => advance.orderId === order.id,
    ),
    sale: store.sales.find((sale) => sale.id === order.saleId) ?? null,
  });
  const applyUpdate = (order: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as Row)) {
        order[key] =
          Number(order[key] ?? 0) +
          Number((value as { increment: number }).increment);
        continue;
      }

      order[key] = value;
    }
  };
  const matchesOrderWhere = (order: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && "in" in (value as Row)) {
        return (value as { in: unknown[] }).in.includes(order[key]);
      }

      if (key === "saleId" && value === null) {
        return order[key] === null || order[key] === undefined;
      }

      return order[key] === value;
    });

  return {
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (strings.join("").includes("nextval")) {
        store.referenceSequence += 1;
        return [{ nextval: BigInt(store.referenceSequence) }];
      }

      return [];
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
      },
    },
    customerOrder: {
      findUnique: async (args: { where: { id: string } }) =>
        findOrder(args.where.id) ?? null,
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const order = findOrder(args.where.id);

        if (!order) {
          throw new Error("missing order");
        }

        return hydrate(order);
      },
      create: async (args: {
        data: Row & {
          lines: { createMany: { data: Row[] } };
        };
      }) => {
        const { lines, ...orderData } = args.data;
        const order: Row = {
          id: `order-${store.customerOrders.length + 1}`,
          status: CustomerOrderStatus.DRAFT,
          advanceBalanceTnd: "0",
          version: 1,
          saleId: null,
          completedAt: null,
          cancelledAt: null,
          cancellationReason: null,
          advanceDisposition: null,
          ...orderData,
        };
        store.customerOrders.push(order);
        lines.createMany.data.forEach((line) => {
          store.customerOrderLines.push({
            id: `order-line-${store.customerOrderLines.length + 1}`,
            orderId: order.id,
            ...line,
          });
        });

        return hydrate(order);
      },
      update: async (args: { where: { id: string }; data: Row }) => {
        const order = findOrder(args.where.id);

        if (!order) {
          throw new Error("missing order");
        }

        applyUpdate(order, args.data);
        return hydrate(order);
      },
      updateMany: async (args: { where: Row; data: Row }) => {
        const { id, ...rest } = args.where;
        const order = findOrder(id);

        if (!order || !matchesOrderWhere(order, rest)) {
          return { count: 0 };
        }

        applyUpdate(order, args.data);
        return { count: 1 };
      },
    },
    customerOrderLine: {
      findMany: async (args: { where: { orderId: string } }) =>
        store.customerOrderLines
          .filter((line) => line.orderId === args.where.orderId)
          .map((line) => ({
            ...line,
            product: store.products.find(
              (product) => product.id === line.productId,
            ),
          })),
      deleteMany: async (args: { where: { orderId: string } }) => {
        store.customerOrderLines = store.customerOrderLines.filter(
          (line) => line.orderId !== args.where.orderId,
        );
      },
      createMany: async (args: { data: Row[] }) => {
        args.data.forEach((line) => {
          store.customerOrderLines.push({
            id: `order-line-${store.customerOrderLines.length + 1}`,
            ...line,
          });
        });
      },
    },
    customerOrderAdvance: {
      create: async (args: { data: Row }) => {
        const advance = {
          id: `advance-${store.customerOrderAdvances.length + 1}`,
          ...args.data,
        };
        store.customerOrderAdvances.push(advance);
        return advance;
      },
    },
    customerLedgerEntry: {
      create: async (args: { data: Row }) => {
        store.customerLedgerEntries.push({
          id: `ledger-${store.customerLedgerEntries.length + 1}`,
          ...args.data,
        });
      },
    },
    customer: {
      findUnique: async (args: { where: { id: string } }) =>
        store.customers.find((customer) => customer.id === args.where.id) ??
        null,
    },
    product: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        store.products.filter((product) =>
          args.where.id.in.includes(product.id),
        ),
    },
    posSession: {
      findFirst: async (args: { where: { status: PosSessionStatus } }) =>
        store.posSessions.find(
          (session) => session.status === args.where.status,
        ) ?? null,
    },
    stockLocation: {
      findUnique: async (args: { where: { code: string } }) =>
        store.stockLocations.find(
          (location) => location.code === args.where.code,
        ) ?? null,
    },
    sale: {
      create: async (args: {
        data: Row & { lines: { createMany: { data: Row[] } } };
      }) => {
        const { lines, ...saleData } = args.data;
        const sale = {
          id: `sale-${store.sales.length + 1}`,
          ...saleData,
        };
        store.sales.push(sale);
        lines.createMany.data.forEach((line) => {
          store.saleLines.push({
            id: `sale-line-${store.saleLines.length + 1}`,
            saleId: sale.id,
            ...line,
          });
        });

        return sale;
      },
    },
    salePayment: {
      create: async (args: { data: Row }) => {
        const payment = {
          id: `payment-${store.salePayments.length + 1}`,
          ...args.data,
        };
        store.salePayments.push(payment);
        return payment;
      },
    },
    inventoryMovement: {
      createMany: async (args: { data: Row[] }) => {
        store.inventoryMovements.push(...args.data);
      },
    },
    auditEvent: {
      create: async (args: { data: Row }) => {
        store.auditEvents.push(args.data);
      },
    },
  };
}
