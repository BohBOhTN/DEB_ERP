import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { HomeService } from "./home.service.js";

/// AS-V2-08: a block appears only when the caller holds its permission. The
/// double answers every aggregate with zero so the test is about scoping;
/// a test that needs figures overrides one model at a time.
function makeModel() {
  const zeroSum = { _sum: {}, _count: { _all: 0 } };

  return {
    aggregate: vi.fn().mockResolvedValue(zeroSum),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
  };
}

type Model = ReturnType<typeof makeModel>;

function makePrisma(overrides: Partial<Record<string, Model>> = {}) {
  const model = makeModel();

  return {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        { revenue: null, costed_revenue: null, cost: null, uncosted_lines: 0n },
      ]),
    sale: model,
    salePayment: model,
    customerOrderAdvance: model,
    customerPayment: model,
    posSession: model,
    user: model,
    customerLedgerEntry: model,
    distributorLedgerEntry: model,
    supplierLedgerEntry: model,
    purchase: model,
    customerOrder: model,
    inventoryMovement: model,
    product: model,
    rawMaterial: model,
    expense: model,
    distributorDispatchLine: model,
    auditEvent: model,
    ...overrides,
  } as unknown as PrismaClient;
}

const money = (value: string) => new Prisma.Decimal(value);

describe("HomeService summary scoping", () => {
  it("returns every block for a user with every permission", async () => {
    const service = new HomeService(makePrisma());

    const summary = await service.getSummary({
      date: "2026-09-22",
      permissions: new Set([
        "pos.access",
        "customer_balances.view",
        "distribution.balances.view",
        "supplier_balances.view",
        "orders.view",
        "inventory.view",
        "expenses.view",
        "purchases.view",
        "distribution.custody.view",
        "audit.view",
        "margin.view",
      ]),
    });

    expect(summary.date).toBe("2026-09-22");
    expect(summary.charges).toEqual({
      dayTnd: "0.000",
      expensesTnd: "0.000",
      rawMaterialsTnd: "0.000",
      previousDayTnd: "0.000",
    });
    expect(summary.margin?.today).toEqual({
      revenueTnd: "0.000",
      costedRevenueTnd: "0.000",
      costTnd: "0.000",
      marginTnd: "0.000",
      uncostedLinesCount: 0,
    });
    expect(summary.sales?.today.totalTnd).toBe("0.000");
    expect(summary.receivables).toEqual({
      customersTnd: "0.000",
      distributorsTnd: "0.000",
    });
    expect(summary.payables?.overdueCount).toBe(0);
    expect(summary.orders).toEqual({
      dueTodayCount: 0,
      overdueCount: 0,
      readyCount: 0,
    });
    expect(summary.stock?.negativeCount).toBe(0);
    expect(summary.expenses).toEqual({
      dayTnd: "0.000",
      dayCount: 0,
      previousDayTnd: "0.000",
    });
    expect(summary.custody?.heldLinesCount).toBe(0);
    expect(summary.recent).toEqual([]);
  });

  it("omits the blocks the caller may not see", async () => {
    const service = new HomeService(makePrisma());

    const summary = await service.getSummary({
      permissions: new Set(["pos.access", "orders.view"]),
    });

    expect(summary.sales).not.toBeNull();
    expect(summary.orders).not.toBeNull();
    expect(summary.payables).toBeNull();
    expect(summary.receivables).toBeNull();
    expect(summary.stock).toBeNull();
    expect(summary.expenses).toBeNull();
    expect(summary.charges).toBeNull();
    expect(summary.custody).toBeNull();
    expect(summary.recent).toBeNull();
    expect(summary.margin).toBeNull();
  });

  // Issue 008: the margin covers the costed lines only and says how many
  // lines had no cost, so 1 250 of revenue with 900 costed at 600 is a
  // 300 margin on 900, not on 1 250.
  it("computes the approximate margin over the costed lines of the day", async () => {
    const prisma = makePrisma();
    (prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          revenue: money("1250"),
          costed_revenue: money("900"),
          cost: money("600"),
          uncosted_lines: 3n,
        },
      ])
      .mockResolvedValueOnce([
        {
          revenue: money("1000"),
          costed_revenue: money("1000"),
          cost: money("650.5"),
          uncosted_lines: 0n,
        },
      ]);
    const service = new HomeService(prisma);

    const summary = await service.getSummary({
      date: "2026-09-22",
      permissions: new Set(["margin.view"]),
    });

    expect(summary.margin).toEqual({
      today: {
        revenueTnd: "1250.000",
        costedRevenueTnd: "900.000",
        costTnd: "600.000",
        marginTnd: "300.000",
        uncostedLinesCount: 3,
      },
      previousDay: {
        revenueTnd: "1000.000",
        costedRevenueTnd: "1000.000",
        costTnd: "650.500",
        marginTnd: "349.500",
        uncostedLinesCount: 0,
      },
    });
    expect(summary.sales).toBeNull();
  });

  it("shows only the distributor side of receivables when that is all the caller may see", async () => {
    const service = new HomeService(makePrisma());

    const summary = await service.getSummary({
      permissions: new Set(["distribution.balances.view"]),
    });

    expect(summary.receivables).toEqual({
      customersTnd: null,
      distributorsTnd: "0.000",
    });
  });
  // Issue #42: the expenses follow the selected business day on the Tunis
  // boundaries, so the first of a month at 00:30 Tunis is that day, not the
  // month before, and "Hier" moves the tile like the sales.
  it("sums the expenses of the requested business day, not the calendar month", async () => {
    const expense = makeModel();
    expense.aggregate
      .mockResolvedValueOnce({
        _sum: { amountTnd: money("85") },
        _count: { _all: 3 },
      })
      .mockResolvedValueOnce({
        _sum: { amountTnd: money("40") },
        _count: { _all: 1 },
      });
    const service = new HomeService(makePrisma({ expense }));

    const summary = await service.getSummary({
      date: "2026-10-01",
      permissions: new Set(["expenses.view"]),
    });

    expect(summary.expenses).toEqual({
      dayTnd: "85.000",
      dayCount: 3,
      previousDayTnd: "40.000",
    });
    expect(expense.aggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          status: "POSTED",
          expenseDate: {
            gte: new Date("2026-09-30T23:00:00.000Z"),
            lte: new Date("2026-10-01T22:59:59.999Z"),
          },
        },
      }),
    );
    expect(expense.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: "POSTED",
          expenseDate: {
            gte: new Date("2026-09-29T23:00:00.000Z"),
            lte: new Date("2026-09-30T22:59:59.999Z"),
          },
        },
      }),
    );
  });

  // Issue 022, DEC-V2-012: the charges of a day are its posted expenses
  // plus the raw materials of its posted purchases; products bought to be
  // resold are stock and stay out.
  it("adds the day's raw-material purchases to its expenses as the charges", async () => {
    const expense = makeModel();
    const figures = () => {
      expense.aggregate
        .mockResolvedValueOnce({
          _sum: { amountTnd: money("85") },
          _count: { _all: 3 },
        })
        .mockResolvedValueOnce({
          _sum: { amountTnd: money("40") },
          _count: { _all: 1 },
        });
      const prisma = makePrisma({ expense });
      const windows: Date[] = [];
      (prisma as unknown as { $queryRaw: unknown }).$queryRaw = vi.fn(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          if (!strings.join("?").includes('"purchase_lines"')) {
            return Promise.resolve([]);
          }
          windows.push(values[0] as Date);
          return Promise.resolve(
            (values[0] as Date).toISOString() === "2026-09-30T23:00:00.000Z"
              ? [
                  { resale: false, total: "120.000" },
                  { resale: true, total: "60.000" },
                ]
              : [{ resale: false, total: "30.000" }],
          );
        },
      );
      return { prisma, windows };
    };

    const { prisma, windows } = figures();
    const summary = await new HomeService(prisma).getSummary({
      date: "2026-10-01",
      permissions: new Set(["expenses.view", "purchases.view"]),
    });

    expect(summary.charges).toEqual({
      dayTnd: "205.000",
      expensesTnd: "85.000",
      rawMaterialsTnd: "120.000",
      previousDayTnd: "70.000",
    });
    // The business day in Tunis, and the day before it.
    expect(windows.map((start) => start.toISOString()).sort()).toEqual([
      "2026-09-29T23:00:00.000Z",
      "2026-09-30T23:00:00.000Z",
    ]);

    // Either permission missing: no figure rather than half of one.
    for (const permissions of [["expenses.view"], ["purchases.view"]]) {
      const partial = figures();
      const without = await new HomeService(partial.prisma).getSummary({
        date: "2026-10-01",
        permissions: new Set(permissions),
      });
      expect(without.charges).toBeNull();
      expect(partial.windows).toEqual([]);
      expense.aggregate.mockReset();
      expense.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
    }
  });

  // Issue #42: "Encaissé en espèces" is the drawer's cash of the day (V1
  // formula): sale receipts less refunds, advances received less refunded,
  // till règlements less those reversed at a till.
  it("counts the day's cash with the V1 drawer formula", async () => {
    const salePayment = makeModel();
    salePayment.groupBy.mockResolvedValue([
      { movement: "RECEIPT", _sum: { amountTnd: money("100") } },
      { movement: "REFUND", _sum: { amountTnd: money("5") } },
    ]);
    const customerOrderAdvance = makeModel();
    customerOrderAdvance.groupBy.mockResolvedValue([
      { movement: "RECEIPT", _sum: { amountTnd: money("20") } },
      { movement: "REFUND", _sum: { amountTnd: money("2") } },
    ]);
    const customerPayment = makeModel();
    customerPayment.aggregate.mockImplementation(
      async ({ where }: { where: { sessionId?: unknown } }) => ({
        _sum: { amountTnd: money(where.sessionId ? "30" : "3") },
      }),
    );
    const service = new HomeService(
      makePrisma({ salePayment, customerOrderAdvance, customerPayment }),
    );

    const summary = await service.getSummary({
      date: "2026-09-22",
      permissions: new Set(["pos.access"]),
    });

    expect(summary.sales?.today.cashTnd).toBe("140.000");
    expect(customerPayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionId: { not: null } }),
      }),
    );
    expect(customerPayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reversedInSessionId: { not: null },
        }),
      }),
    );
  });
});
