import { SaleStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { CustomersService } from "./customers.service.js";

describe("CustomersService customer payments", () => {
  it("records customer payments against receivable ledger without sale revenue effects", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    const result = await service.createCustomerPayment(
      {
        idempotencyKey: "customer-payment-1",
        customerId: "customer-1",
        paidAt: new Date("2026-09-21T08:00:00.000Z"),
        amountTnd: "20.000",
        reference: "CLI-1",
        allocations: [
          {
            saleId: "sale-1",
            amountTnd: "20.000",
          },
        ],
      },
      { actorUserId: "user-1", correlationId: "correlation-1" },
    );

    expect(result.payment).toMatchObject({
      customerId: "customer-1",
      amountTnd: "20.000",
      reference: "CLI-1",
    });
    expect(result.allocations).toEqual([
      {
        saleId: "sale-1",
        amountTnd: "20.000",
      },
    ]);
    expect(prisma.store.customerLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "SALE_RECEIVABLE",
        amountTnd: "50.000",
      }),
      expect.objectContaining({
        entryType: "PAYMENT",
        amountTnd: "-20.000",
        paymentId: "payment-1",
        saleId: "sale-1",
      }),
    ]);
    expect(prisma.store.sales).toHaveLength(2);
    expect(prisma.store.sales).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sale-1",
          totalTnd: "50.000",
        }),
      ]),
    );
  });

  it("returns the same customer payment on idempotent retry", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);
    const payload = {
      idempotencyKey: "customer-payment-1",
      customerId: "customer-1",
      paidAt: new Date("2026-09-21T08:00:00.000Z"),
      amountTnd: "20.000",
      allocations: [
        {
          saleId: "sale-1",
          amountTnd: "20.000",
        },
      ],
    };

    await service.createCustomerPayment(payload, { actorUserId: "user-1" });
    const retry = await service.createCustomerPayment(payload, {
      actorUserId: "user-1",
    });

    expect(retry.payment.id).toBe("payment-1");
    expect(prisma.store.customerPayments).toHaveLength(1);
    expect(
      prisma.store.customerLedgerEntries.filter(
        (entry) => entry.entryType === "PAYMENT",
      ),
    ).toHaveLength(1);
  });

  it("rejects customer overpayment while customer credit is not approved", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    await expect(
      service.createCustomerPayment(
        {
          idempotencyKey: "customer-payment-over",
          customerId: "customer-1",
          paidAt: new Date("2026-09-21T08:00:00.000Z"),
          amountTnd: "51.000",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "CUSTOMER_OVERPAYMENT_REJECTED",
    });

    expect(prisma.store.customerPayments).toHaveLength(0);
  });

  // The source-of-truth expected-cash formula counts customer payments taken
  // at the till, so those and only those carry the open session.
  it("links a payment collected at the till to the open POS session", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    prisma.store.posSessions.push({ id: "session-1", status: "OPEN" });
    const service = new CustomersService(prisma as unknown as PrismaClient);

    await service.createCustomerPayment(
      {
        idempotencyKey: "customer-payment-pos",
        customerId: "customer-1",
        paidAt: new Date("2026-09-21T08:00:00.000Z"),
        amountTnd: "20.000",
        collectedAtPos: true,
      },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.customerPayments[0]).toMatchObject({
      sessionId: "session-1",
    });
  });

  it("leaves a back-office payment without a POS session", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    prisma.store.posSessions.push({ id: "session-1", status: "OPEN" });
    const service = new CustomersService(prisma as unknown as PrismaClient);

    await service.createCustomerPayment(
      {
        idempotencyKey: "customer-payment-office",
        customerId: "customer-1",
        paidAt: new Date("2026-09-21T08:00:00.000Z"),
        amountTnd: "20.000",
      },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.customerPayments[0]).toMatchObject({
      sessionId: null,
    });
  });

  it("rejects a till payment when no POS session is open", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    await expect(
      service.createCustomerPayment(
        {
          idempotencyKey: "customer-payment-pos",
          customerId: "customer-1",
          paidAt: new Date("2026-09-21T08:00:00.000Z"),
          amountTnd: "20.000",
          collectedAtPos: true,
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "POS_SESSION_NOT_OPEN",
    });

    expect(prisma.store.customerPayments).toHaveLength(0);
  });

  it("rejects allocations that exceed a posted sale balance", async () => {
    const prisma = new CustomerPaymentPrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    await expect(
      service.createCustomerPayment(
        {
          idempotencyKey: "customer-payment-bad-allocation",
          customerId: "customer-1",
          paidAt: new Date("2026-09-21T08:00:00.000Z"),
          amountTnd: "50.000",
          allocations: [
            {
              saleId: "sale-2",
              amountTnd: "50.000",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_ALLOCATION_EXCEEDS_SALE_BALANCE",
    });
  });
});

interface CustomerPaymentStore {
  posSessions: Array<{ id: string; status: string }>;
  customers: Array<{ id: string; isActive: boolean; name: string }>;
  sales: Array<{
    id: string;
    customerId: string;
    status: SaleStatus;
    totalTnd: string;
  }>;
  customerLedgerEntries: Array<{
    id: string;
    customerId: string;
    saleId: string | null;
    paymentId: string | null;
    balanceKind: string;
    entryType: string;
    amountTnd: string;
  }>;
  customerPayments: Array<{
    id: string;
    customerId: string;
    sessionId?: string | null;
    amountTnd: string;
    reference?: string | null;
  }>;
  customerPaymentAllocations: Array<{
    paymentId: string;
    saleId: string;
    amountTnd: string;
  }>;
  auditEvents: Array<{ action: string; targetId: string }>;
  idempotencyRecords: Array<{
    scope: string;
    key: string;
    requestHash: string;
    response: unknown;
  }>;
}

class CustomerPaymentPrismaDouble {
  public store = createCustomerPaymentStore();

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
          tx: ReturnType<typeof makeCustomerPaymentTransactionClient>,
        ) => Promise<TResult>),
  ): Promise<TResult> {
    if (Array.isArray(action)) {
      return (await Promise.all(action)) as TResult;
    }

    const staged = structuredClone(this.store) as CustomerPaymentStore;
    const result = await action(makeCustomerPaymentTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function makeCustomerPaymentTransactionClient(store: CustomerPaymentStore) {
  return {
    customer: {
      findUnique: async (args: { where: { id: string } }) =>
        store.customers.find((customer) => customer.id === args.where.id) ??
        null,
    },
    posSession: {
      findFirst: async (args: { where: { status: string } }) =>
        store.posSessions.find(
          (session) => session.status === args.where.status,
        ) ?? null,
    },
    customerLedgerEntry: {
      findMany: async (args: {
        where: { customerId: string; balanceKind?: string };
      }) =>
        store.customerLedgerEntries.filter(
          (entry) =>
            entry.customerId === args.where.customerId &&
            (args.where.balanceKind === undefined ||
              entry.balanceKind === args.where.balanceKind),
        ),
      create: async (args: { data: LedgerEntryInput }) => {
        const entry = withDefaultBalanceKind(
          args.data,
          store.customerLedgerEntries.length + 1,
        );
        store.customerLedgerEntries.push(entry);
        return entry;
      },
      createMany: async (args: { data: LedgerEntryInput[] }) => {
        for (const item of args.data) {
          store.customerLedgerEntries.push(
            withDefaultBalanceKind(
              item,
              store.customerLedgerEntries.length + 1,
            ),
          );
        }
        return { count: args.data.length };
      },
    },
    customerPayment: {
      create: async (args: {
        data: Omit<CustomerPaymentStore["customerPayments"][number], "id">;
      }) => {
        const payment = {
          ...args.data,
          id: `payment-${store.customerPayments.length + 1}`,
        };
        store.customerPayments.push(payment);
        return payment;
      },
    },
    customerPaymentAllocation: {
      createMany: async (args: {
        data: CustomerPaymentStore["customerPaymentAllocations"];
      }) => {
        store.customerPaymentAllocations.push(...args.data);
        return { count: args.data.length };
      },
    },
    sale: {
      findMany: async (args: {
        where: {
          id: { in: string[] };
          customerId: string;
          status: SaleStatus;
        };
      }) =>
        store.sales.filter(
          (sale) =>
            args.where.id.in.includes(sale.id) &&
            sale.customerId === args.where.customerId &&
            sale.status === args.where.status,
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

function createCustomerPaymentStore(): CustomerPaymentStore {
  return {
    posSessions: [],
    customers: [
      {
        id: "customer-1",
        name: "Client Comptoir",
        isActive: true,
      },
    ],
    sales: [
      {
        id: "sale-1",
        customerId: "customer-1",
        status: SaleStatus.POSTED,
        totalTnd: "50.000",
      },
      {
        id: "sale-2",
        customerId: "customer-1",
        status: SaleStatus.POSTED,
        totalTnd: "10.000",
      },
    ],
    customerLedgerEntries: [
      {
        id: "ledger-1",
        customerId: "customer-1",
        saleId: "sale-1",
        paymentId: null,
        balanceKind: "RECEIVABLE",
        entryType: "SALE_RECEIVABLE",
        amountTnd: "50.000",
      },
    ],
    customerPayments: [],
    customerPaymentAllocations: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

type LedgerEntryInput = Omit<
  CustomerPaymentStore["customerLedgerEntries"][number],
  "id" | "balanceKind"
> & { balanceKind?: string };

/// The database column defaults to RECEIVABLE, so the double must too.
function withDefaultBalanceKind(data: LedgerEntryInput, index: number) {
  return {
    balanceKind: "RECEIVABLE",
    ...data,
    id: `ledger-${index}`,
  };
}
