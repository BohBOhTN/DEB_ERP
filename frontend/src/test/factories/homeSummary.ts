import type { HomeSummary } from "../../features/home/home.api.js";

/// An owner's summary on a busy day. Pass `null` blocks to simulate missing
/// permissions, or `fresh()` for an empty database.
export function makeHomeSummary(
  overrides: Partial<HomeSummary> = {},
): HomeSummary {
  return {
    date: "2026-09-23",
    generatedAt: "2026-09-23T10:00:00.000Z",
    sales: {
      today: {
        count: 14,
        totalTnd: "1250.000",
        cashTnd: "980.000",
        creditTnd: "270.000",
      },
      previousDay: {
        count: 11,
        totalTnd: "1116.000",
        cashTnd: "900.000",
        creditTnd: "216.000",
      },
    },
    openSession: {
      id: "session-1",
      openedAt: "2026-09-23T07:12:00.000Z",
      terminal: "Caisse principale",
      cashier: { id: "user-2", displayName: "Amine" },
      openingCashTnd: "50.000",
    },
    receivables: { customersTnd: "2340.500", distributorsTnd: "410.000" },
    payables: {
      suppliersTnd: "5120.000",
      overdueCount: 3,
      overdueTnd: "1800.000",
    },
    orders: { dueTodayCount: 4, overdueCount: 2, readyCount: 1 },
    stock: {
      negativeCount: 1,
      items: [
        {
          itemType: "RAW_MATERIAL",
          itemId: "rm-1",
          name: "Farine T55",
          quantity: "-2.500",
        },
      ],
    },
    expenses: { dayTnd: "85.000", dayCount: 3, previousDayTnd: "40.000" },
    custody: { heldLinesCount: 12 },
    recent: [
      {
        id: "evt-1",
        at: "2026-09-23T09:55:00.000Z",
        action: "pos_sale.post",
        actionLabelFr: "Vente en caisse",
        entity: "sale",
        entityLabelFr: "Vente",
        targetId: "sale-1",
        module: "pos",
        actor: { id: "user-2", displayName: "Amine" },
      },
    ],
    ...overrides,
  };
}

export function makeFreshHomeSummary(): HomeSummary {
  return makeHomeSummary({
    sales: {
      today: {
        count: 0,
        totalTnd: "0.000",
        cashTnd: "0.000",
        creditTnd: "0.000",
      },
      previousDay: {
        count: 0,
        totalTnd: "0.000",
        cashTnd: "0.000",
        creditTnd: "0.000",
      },
    },
    openSession: null,
    receivables: { customersTnd: "0.000", distributorsTnd: "0.000" },
    payables: { suppliersTnd: "0.000", overdueCount: 0, overdueTnd: "0.000" },
    orders: { dueTodayCount: 0, overdueCount: 0, readyCount: 0 },
    stock: { negativeCount: 0, items: [] },
    expenses: { dayTnd: "0.000", dayCount: 0, previousDayTnd: "0.000" },
    custody: { heldLinesCount: 0 },
    recent: [],
  });
}
