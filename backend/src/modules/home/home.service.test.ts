import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { HomeService } from "./home.service.js";

/// AS-V2-08: a block appears only when the caller holds its permission. The
/// double answers every aggregate with zero so the test is about scoping.
function makePrisma() {
  const zeroSum = { _sum: {}, _count: { _all: 0 } };
  const model = {
    aggregate: vi.fn().mockResolvedValue(zeroSum),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
  };

  return {
    sale: model,
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
  } as unknown as PrismaClient;
}

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
    expect(summary.expenses?.monthTnd).toBe("0.000");
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
});
