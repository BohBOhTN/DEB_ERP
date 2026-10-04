import { Prisma, PosSessionStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PosService } from "./pos.service.js";

/// Issue 014: the totals above the session history and what one session
/// looked like. The doubles answer the aggregates; the SQL of the hourly
/// split runs against PostgreSQL in the analytics integration suite.
const money = (value: string) => new Prisma.Decimal(value);

function makeModel() {
  return {
    aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
  };
}

function makePrisma() {
  const models = {
    posSession: makeModel(),
    sale: makeModel(),
    salePayment: makeModel(),
    saleLine: makeModel(),
    customerOrderAdvance: makeModel(),
    customerPayment: makeModel(),
    product: makeModel(),
    user: makeModel(),
  };
  const queryRaw = vi.fn().mockResolvedValue([]);

  return {
    models,
    queryRaw,
    service: new PosService({
      $queryRaw: queryRaw,
      ...models,
    } as unknown as PrismaClient),
  };
}

describe("PosService session history totals", () => {
  it("counts sessions by state and keeps shortages apart from surpluses", async () => {
    const { service, models } = makePrisma();
    models.posSession.groupBy.mockResolvedValue([
      { status: PosSessionStatus.OPEN, _count: { _all: 1 } },
      { status: PosSessionStatus.CLOSED, _count: { _all: 11 } },
    ]);
    models.sale.aggregate.mockResolvedValue({
      _count: { _all: 340 },
      _sum: { totalTnd: money("4180.500") },
    });
    models.posSession.aggregate.mockImplementation(
      (args: { where: { cashDifferenceTnd: { lt?: number } } }) =>
        Promise.resolve(
          "lt" in args.where.cashDifferenceTnd
            ? {
                _count: { _all: 3 },
                _sum: { cashDifferenceTnd: money("-12.000") },
              }
            : {
                _count: { _all: 1 },
                _sum: { cashDifferenceTnd: money("2.500") },
              },
        ),
    );
    const from = new Date("2026-08-31T23:00:00.000Z");
    const to = new Date("2026-09-30T22:59:59.999Z");

    const summary = await service.summarizeSessions({ from, to });

    expect(summary).toEqual({
      count: 12,
      openCount: 1,
      closedCount: 11,
      salesCount: 340,
      salesTotalTnd: "4180.500",
      differenceTnd: "-9.500",
      shortageTnd: "-12.000",
      surplusTnd: "2.500",
      withDifferenceCount: 4,
    });
    // The totals read the sessions the list shows: posted sales of sessions
    // opened in the period.
    expect(models.sale.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          session: { openedAt: { gte: from, lte: to } },
          status: "POSTED",
        },
      }),
    );
  });

  it("answers an empty period with zeros", async () => {
    const { service } = makePrisma();

    expect(await service.summarizeSessions({})).toEqual({
      count: 0,
      openCount: 0,
      closedCount: 0,
      salesCount: 0,
      salesTotalTnd: "0.000",
      differenceTnd: "0.000",
      shortageTnd: "0.000",
      surplusTnd: "0.000",
      withDifferenceCount: 0,
    });
  });
});

describe("PosService session insights", () => {
  const session = {
    id: "session-1",
    status: PosSessionStatus.CLOSED,
    openedByUserId: "user-1",
    closedByUserId: "user-1",
    terminal: { id: "terminal-1", name: "Caisse principale" },
  };

  it("adds the average basket, the cancelled sales, the hours and the best products", async () => {
    const { service, models, queryRaw } = makePrisma();
    models.posSession.findUnique.mockResolvedValue(session);
    models.sale.aggregate.mockResolvedValue({
      _count: { _all: 4 },
      _sum: { totalTnd: money("50.000"), remainingDueTnd: money("10.000") },
    });
    models.sale.count.mockResolvedValue(1);
    queryRaw.mockResolvedValue([
      { hour: 7, count: 3, total: "35.000" },
      { hour: 12, count: 1, total: "15" },
    ]);
    models.saleLine.groupBy.mockResolvedValue([
      {
        productId: "baguette",
        _sum: { quantity: money("40"), lineTotalTnd: money("32.000") },
      },
      {
        productId: "croissant",
        _sum: { quantity: money("12"), lineTotalTnd: money("18.000") },
      },
    ]);
    models.product.findMany.mockResolvedValue([
      { id: "croissant", name: "Croissant", baseUnit: { name: "Pièce" } },
      { id: "baguette", name: "Baguette", baseUnit: { name: "Pièce" } },
    ]);

    const { insights, totals } = await service.getSession("session-1");

    expect(totals.salesCount).toBe(4);
    expect(insights).toEqual({
      averageBasketTnd: "12.500",
      cancelledSalesCount: 1,
      hourly: [
        { hour: 7, count: 3, totalTnd: "35.000" },
        { hour: 12, count: 1, totalTnd: "15.000" },
      ],
      topProducts: [
        {
          productId: "baguette",
          name: "Baguette",
          unitName: "Pièce",
          quantity: "40.000000",
          revenueTnd: "32.000",
        },
        {
          productId: "croissant",
          name: "Croissant",
          unitName: "Pièce",
          quantity: "12.000000",
          revenueTnd: "18.000",
        },
      ],
    });
    expect(models.saleLine.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sale: { sessionId: "session-1", status: "POSTED" } },
        take: 5,
      }),
    );
  });

  it("has no average basket for a session without a sale", async () => {
    const { service, models } = makePrisma();
    models.posSession.findUnique.mockResolvedValue(session);

    const { insights } = await service.getSession("session-1");

    expect(insights).toEqual({
      averageBasketTnd: null,
      cancelledSalesCount: 0,
      hourly: [],
      topProducts: [],
    });
  });
});
