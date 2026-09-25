import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { OrdersService } from "../orders/orders.service.js";
import { PosService } from "../pos/pos.service.js";
import { ProcurementService } from "../procurement/procurement.service.js";

/// Section 18 requires each module to offer usable lists, and NFR-005 requires
/// those lists to filter and sort stably on the server. These tests assert the
/// query each list builds rather than re-testing Prisma.
describe("operational view queries", () => {
  it("lists POS sales filtered by date, customer, payment state, and cashier", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new PosService(prisma as unknown as PrismaClient);

    await service.listSales({
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-30T23:59:59.000Z"),
      customerId: "customer-1",
      paymentState: "PARTIALLY_PAID",
      cashierUserId: "user-7",
      page: 1,
      pageSize: 25,
    });

    expect(prisma.lastArgs.where).toMatchObject({
      customerId: "customer-1",
      paymentState: "PARTIALLY_PAID",
      postedByUserId: "user-7",
      soldAt: {
        gte: new Date("2026-09-01T00:00:00.000Z"),
        lte: new Date("2026-09-30T23:59:59.000Z"),
      },
    });
    // NFR-005: the id breaks ties so paging is deterministic.
    expect(prisma.lastArgs.orderBy).toEqual([
      { soldAt: "desc" },
      { id: "desc" },
    ]);
  });

  // Issue #44: the list shows posted sales unless asked for the cancelled
  // ones, and searches the reference or the customer name.
  it("lists posted sales by default and searches them", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new PosService(prisma as unknown as PrismaClient);

    await service.listSales({ search: "VT-0001", page: 1, pageSize: 25 });

    expect(prisma.lastArgs.where).toMatchObject({
      status: "POSTED",
      OR: [
        { reference: { contains: "VT-0001", mode: "insensitive" } },
        { customer: { normalizedName: { contains: "vt-0001" } } },
      ],
    });

    await service.listSales({ status: "CANCELLED", page: 1, pageSize: 25 });
    expect(prisma.lastArgs.where).toMatchObject({ status: "CANCELLED" });
  });

  it("treats an overdue purchase as posted, still owed, and past its due date", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new ProcurementService(prisma as unknown as PrismaClient);
    const asOf = new Date("2026-09-22T00:00:00.000Z");

    await service.listPurchases({
      dueState: "OVERDUE",
      asOf,
      page: 1,
      pageSize: 25,
    });

    expect(prisma.lastArgs.where).toMatchObject({
      status: "POSTED",
      remainingDueTnd: { gt: 0 },
      dueDate: { lt: asOf },
    });
    expect(prisma.lastArgs.orderBy).toEqual([
      { dueDate: "asc" },
      { id: "asc" },
    ]);
  });

  it("treats an upcoming purchase as due on or after today", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new ProcurementService(prisma as unknown as PrismaClient);
    const asOf = new Date("2026-09-22T00:00:00.000Z");

    await service.listPurchases({
      dueState: "UPCOMING",
      asOf,
      page: 1,
      pageSize: 25,
    });

    expect(prisma.lastArgs.where).toMatchObject({
      dueDate: { gte: asOf },
    });
  });

  // A fully paid purchase is never "due", whatever its due date or its
  // entry-time terms say: the projection of its ledger decides (#47).
  it("excludes fully paid purchases from the due lists", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new ProcurementService(prisma as unknown as PrismaClient);

    await service.listPurchases({
      dueState: "OVERDUE",
      page: 1,
      pageSize: 25,
    });

    const where = prisma.lastArgs.where as {
      remainingDueTnd: { gt: number };
      paymentTerms?: unknown;
    };
    expect(where.remainingDueTnd).toEqual({ gt: 0 });
    expect(where.paymentTerms).toBeUndefined();
  });

  it("treats an overdue order as still awaiting fulfilment and past its time", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new OrdersService(prisma as unknown as PrismaClient);
    const asOf = new Date("2026-09-22T00:00:00.000Z");

    await service.listOrders({
      dueState: "OVERDUE",
      asOf,
      page: 1,
      pageSize: 25,
    });

    const where = prisma.lastArgs.where as {
      status: { in: string[] };
      requestedFulfillmentAt: { lt: Date };
    };

    expect(where.status.in).toEqual([
      "DRAFT",
      "CONFIRMED",
      "PREPARING",
      "READY",
    ]);
    // A completed or cancelled order can never be overdue.
    expect(where.status.in).not.toContain("COMPLETED");
    expect(where.status.in).not.toContain("CANCELLED");
    expect(where.requestedFulfillmentAt.lt).toEqual(asOf);
  });

  // Issue #45: a due state and a date window combine. "Upcoming before the
  // end of today" is today's queue; the window no longer disappears.
  it("combines a due state with a date window", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new OrdersService(prisma as unknown as PrismaClient);
    const asOf = new Date("2026-09-22T09:00:00.000Z");
    const dayEnd = new Date("2026-09-22T22:59:59.999Z");

    await service.listOrders({
      dueState: "UPCOMING",
      dueBefore: dayEnd,
      asOf,
      page: 1,
      pageSize: 25,
    });

    expect(prisma.lastArgs.where).toMatchObject({
      status: { in: ["DRAFT", "CONFIRMED", "PREPARING", "READY"] },
      requestedFulfillmentAt: { gte: asOf, lte: dayEnd },
    });
  });

  it("searches the queue by reference or customer name", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new OrdersService(prisma as unknown as PrismaClient);

    await service.listOrders({ search: "Amel", page: 1, pageSize: 25 });

    expect(prisma.lastArgs.where).toMatchObject({
      OR: [
        { reference: { contains: "Amel", mode: "insensitive" } },
        { customer: { normalizedName: { contains: "amel" } } },
      ],
    });
  });

  it("treats an upcoming order as due on or after now", async () => {
    const prisma = new QueryCapturingPrisma();
    const service = new OrdersService(prisma as unknown as PrismaClient);
    const asOf = new Date("2026-09-22T00:00:00.000Z");

    await service.listOrders({
      dueState: "UPCOMING",
      asOf,
      page: 1,
      pageSize: 25,
    });

    expect(prisma.lastArgs.where).toMatchObject({
      requestedFulfillmentAt: { gte: asOf },
    });
  });
});

/// Captures the arguments the service hands to Prisma so the built query can be
/// asserted directly.
class QueryCapturingPrisma {
  public lastArgs: Record<string, unknown> = {};

  private readonly model = {
    findMany: async (args: Record<string, unknown>) => {
      this.lastArgs = args;
      return [];
    },
    count: async () => 0,
    groupBy: async () => [],
  };

  public readonly sale = this.model;
  public readonly purchase = this.model;
  public readonly customerOrder = this.model;
  public readonly customerOrderAdvance = this.model;

  public async $transaction<TResult>(
    actions: Array<Promise<unknown>>,
  ): Promise<TResult> {
    return (await Promise.all(actions)) as TResult;
  }
}
