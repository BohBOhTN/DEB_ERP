import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { CustomersService } from "./customers.service.js";

/// Issue #46: a customer is deactivated, never deleted, and only once
/// nothing is owed either way; the page figures are summed by the database.
describe("CustomersService lifecycle and figures", () => {
  it("deactivates a settled customer, refuses one with a balance, and reactivates", async () => {
    const prisma = new LifecyclePrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    await expect(
      service.setCustomerActive(
        "customer-owing",
        { isActive: false, reason: "Doublon" },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "CUSTOMER_HAS_BALANCE" });

    const deactivated = await service.setCustomerActive(
      "customer-settled",
      { isActive: false, reason: "Doublon" },
      { actorUserId: "user-1" },
    );
    expect(deactivated).toMatchObject({ isActive: false, version: 2 });
    expect(prisma.store.auditEvents.at(-1)).toMatchObject({
      action: "customer.deactivate",
    });

    await expect(
      service.setCustomerActive(
        "customer-settled",
        { isActive: false },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "CUSTOMER_ALREADY_INACTIVE" });

    const reactivated = await service.setCustomerActive(
      "customer-settled",
      { isActive: true },
      { actorUserId: "user-1" },
    );
    expect(reactivated).toMatchObject({ isActive: true, version: 3 });
    expect(prisma.store.auditEvents.at(-1)).toMatchObject({
      action: "customer.reactivate",
    });
  });

  it("sums the figures: orders without the cancelled ones, posted sales, what is due", async () => {
    const prisma = new LifecyclePrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    const summary = await service.getCustomerSummary("customer-owing");

    expect(summary).toEqual({
      ordersCount: 2,
      openOrdersCount: 1,
      salesCount: 2,
      cancelledSalesCount: 1,
      salesTotalTnd: "80.000",
      paidTnd: "50.000",
      dueTnd: "30.000",
      advanceTnd: "5.000",
      lastSaleAt: new Date("2026-09-24T09:00:00.000Z"),
      lastPaymentAt: new Date("2026-09-24T10:00:00.000Z"),
    });
  });

  it("pages the customer's sales with the balance the ledger still carries", async () => {
    const prisma = new LifecyclePrismaDouble();
    const service = new CustomersService(prisma as unknown as PrismaClient);

    const page = await service.listCustomerSales("customer-owing", {
      page: 1,
      pageSize: 2,
    });

    expect(page.total).toBe(3);
    expect(page.items.map((sale) => [sale.id, sale.balanceTnd])).toEqual([
      ["sale-3", "0.000"],
      ["sale-2", "30.000"],
    ]);
  });
});

interface Row {
  [key: string]: unknown;
}

class LifecyclePrismaDouble {
  public store = {
    customers: [
      { id: "customer-owing", isActive: true, version: 1, name: "Amel" },
      { id: "customer-settled", isActive: true, version: 1, name: "Sami" },
    ] as Row[],
    ledger: [
      {
        customerId: "customer-owing",
        balanceKind: "RECEIVABLE",
        saleId: "sale-2",
        amountTnd: "30.000",
      },
      {
        customerId: "customer-owing",
        balanceKind: "ADVANCE",
        saleId: null,
        amountTnd: "5.000",
      },
      {
        customerId: "customer-settled",
        balanceKind: "RECEIVABLE",
        saleId: "sale-9",
        amountTnd: "10.000",
      },
      {
        customerId: "customer-settled",
        balanceKind: "RECEIVABLE",
        saleId: "sale-9",
        amountTnd: "-10.000",
      },
    ] as Row[],
    sales: [
      {
        id: "sale-1",
        customerId: "customer-owing",
        status: "POSTED",
        soldAt: new Date("2026-09-20T09:00:00.000Z"),
        totalTnd: "30.000",
        paidAmountTnd: "30.000",
      },
      {
        id: "sale-2",
        customerId: "customer-owing",
        status: "POSTED",
        soldAt: new Date("2026-09-24T09:00:00.000Z"),
        totalTnd: "50.000",
        paidAmountTnd: "20.000",
      },
      {
        id: "sale-3",
        customerId: "customer-owing",
        status: "CANCELLED",
        soldAt: new Date("2026-09-25T09:00:00.000Z"),
        totalTnd: "7.000",
        paidAmountTnd: "7.000",
      },
    ] as Row[],
    orders: [
      { customerId: "customer-owing", status: "CONFIRMED" },
      { customerId: "customer-owing", status: "COMPLETED" },
      { customerId: "customer-owing", status: "CANCELLED" },
    ] as Row[],
    payments: [
      {
        customerId: "customer-owing",
        paidAt: new Date("2026-09-24T10:00:00.000Z"),
        reversedAt: null,
      },
      {
        customerId: "customer-owing",
        paidAt: new Date("2026-09-25T10:00:00.000Z"),
        reversedAt: new Date(),
      },
    ] as Row[],
    auditEvents: [] as Row[],
  };

  private matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, condition]) => {
      const value = row[key];
      if (
        condition &&
        typeof condition === "object" &&
        !(condition instanceof Date)
      ) {
        const c = condition as Row;
        if ("in" in c) return (c.in as unknown[]).includes(value);
        if ("not" in c) return value !== c.not;
        return true;
      }
      return value === condition;
    });
  }

  private sum(rows: Row[], key: string) {
    return rows.reduce(
      (total, row) => total.plus(String(row[key])),
      new Prisma.Decimal(0),
    );
  }

  public readonly customer = {
    findUnique: async (args: { where: { id: string } }) =>
      this.store.customers.find((row) => row.id === args.where.id) ?? null,
    update: async (args: { where: { id: string }; data: Row }) => {
      const row = this.store.customers.find(
        (c) => c.id === args.where.id,
      ) as Row;
      const { version, ...rest } = args.data;
      Object.assign(row, rest, {
        version:
          (row.version as number) +
          (((version as Row)?.increment as number) ?? 0),
      });
      return row;
    },
  };

  public readonly customerLedgerEntry = {
    groupBy: async (args: { by: string[]; where: Row }) => {
      const key = args.by[0] as string;
      const groups = new Map<string, Prisma.Decimal>();
      for (const row of this.store.ledger) {
        if (!this.matches(row, args.where)) continue;
        const k = String(row[key]);
        groups.set(
          k,
          (groups.get(k) ?? new Prisma.Decimal(0)).plus(String(row.amountTnd)),
        );
      }
      return [...groups.entries()].map(([k, amountTnd]) => ({
        [key]: k === "null" ? null : k,
        _sum: { amountTnd },
      }));
    },
  };

  public readonly sale = {
    aggregate: async (args: { where: Row }) => {
      const rows = this.store.sales.filter((row) =>
        this.matches(row, args.where),
      );
      return {
        _count: { _all: rows.length },
        _sum: {
          totalTnd: this.sum(rows, "totalTnd"),
          paidAmountTnd: this.sum(rows, "paidAmountTnd"),
        },
      };
    },
    count: async (args: { where: Row }) =>
      this.store.sales.filter((row) => this.matches(row, args.where)).length,
    findFirst: async (args: { where: Row }) =>
      [...this.store.sales]
        .filter((row) => this.matches(row, args.where))
        .sort(
          (a, b) => (b.soldAt as Date).getTime() - (a.soldAt as Date).getTime(),
        )[0] ?? null,
    findMany: async (args: { where: Row; skip: number; take: number }) =>
      [...this.store.sales]
        .filter((row) => this.matches(row, args.where))
        .sort(
          (a, b) => (b.soldAt as Date).getTime() - (a.soldAt as Date).getTime(),
        )
        .slice(args.skip, args.skip + args.take),
  };

  public readonly customerOrder = {
    count: async (args: { where: Row }) =>
      this.store.orders.filter((row) => this.matches(row, args.where)).length,
  };

  public readonly customerPayment = {
    findFirst: async (args: { where: Row }) =>
      [...this.store.payments]
        .filter((row) => this.matches(row, args.where))
        .sort(
          (a, b) => (b.paidAt as Date).getTime() - (a.paidAt as Date).getTime(),
        )[0] ?? null,
  };

  public readonly auditEvent = {
    create: async (args: { data: Row }) => {
      this.store.auditEvents.push(args.data);
    },
  };

  public async $transaction<T>(
    action: Array<Promise<unknown>> | ((tx: this) => Promise<T>),
  ): Promise<T> {
    if (Array.isArray(action)) return (await Promise.all(action)) as T;
    return action(this);
  }
}
