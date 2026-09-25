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
        "distribution.custody.view",
        "audit.view",
      ]),
    });

    expect(summary.date).toBe("2026-09-22");
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
    expect(summary.custody).toBeNull();
    expect(summary.recent).toBeNull();
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
