import type {
  AnalyticsCustomers,
  AnalyticsFrequency,
  AnalyticsOverview,
  AnalyticsPeriod,
  AnalyticsProducts,
  FrequencyBlock,
  FrequencyCell,
} from "../../features/analytics/analytics.api.js";

/// September 2026, compared with August: thirty days, daily buckets.
export const analyticsPeriod: AnalyticsPeriod = {
  from: "2026-09-01",
  to: "2026-09-30",
  days: 30,
  granularity: "day",
  previousFrom: "2026-08-02",
  previousTo: "2026-08-31",
};

const day = (index: number) => `2026-09-${String(index + 1).padStart(2, "0")}`;

/// An owner's month: 4 800 TND over three channels, up a fifth on August,
/// the best day a Saturday.
export function makeAnalyticsOverview(
  overrides: Partial<AnalyticsOverview> = {},
): AnalyticsOverview {
  return {
    period: analyticsPeriod,
    generatedAt: "2026-09-30T18:00:00.000Z",
    revenue: {
      totalTnd: "4800.000",
      previousTotalTnd: "4000.000",
      counterTnd: "3000.000",
      ordersTnd: "600.000",
      distributorsTnd: "1200.000",
    },
    sales: {
      count: 360,
      previousCount: 320,
      averageBasketTnd: "10.000",
      previousAverageBasketTnd: "9.500",
      remainingDueTnd: "240.000",
      cancelledCount: 2,
    },
    expenses: {
      totalTnd: "900.000",
      previousTotalTnd: "1000.000",
      byCategory: [
        { categoryId: "energy", name: "Énergie", totalTnd: "600.000" },
        { categoryId: "rent", name: "Loyer", totalTnd: "300.000" },
      ],
    },
    margin: {
      current: {
        revenueTnd: "3600.000",
        costedRevenueTnd: "2700.000",
        costTnd: "1200.000",
        marginTnd: "1500.000",
        uncostedLinesCount: 40,
      },
      previous: {
        revenueTnd: "3000.000",
        costedRevenueTnd: "2400.000",
        costTnd: "1400.000",
        marginTnd: "1000.000",
        uncostedLinesCount: 35,
      },
    },
    trend: Array.from({ length: 30 }, (_, index) => ({
      bucket: day(index),
      revenueTnd: index === 11 ? "410.000" : "150.000",
      salesCount: index === 11 ? 30 : 11,
      expensesTnd: index === 5 ? "600.000" : "0.000",
      previousRevenueTnd: "133.000",
    })),
    bestBucket: { bucket: "2026-09-12", revenueTnd: "410.000" },
    ...overrides,
  };
}

/// A month with nothing sold and nothing spent.
export function makeQuietOverview(): AnalyticsOverview {
  return makeAnalyticsOverview({
    revenue: {
      totalTnd: "0.000",
      previousTotalTnd: "0.000",
      counterTnd: "0.000",
      ordersTnd: "0.000",
      distributorsTnd: "0.000",
    },
    sales: {
      count: 0,
      previousCount: 0,
      averageBasketTnd: null,
      previousAverageBasketTnd: null,
      remainingDueTnd: "0.000",
      cancelledCount: 0,
    },
    expenses: { totalTnd: "0.000", previousTotalTnd: "0.000", byCategory: [] },
    margin: null,
    trend: Array.from({ length: 30 }, (_, index) => ({
      bucket: day(index),
      revenueTnd: "0.000",
      salesCount: 0,
      expensesTnd: "0.000",
      previousRevenueTnd: "0.000",
    })),
    bestBucket: null,
  });
}

/// Shapes cells the way the server does: the seven weekdays with their
/// average over four occurrences, the twenty-four hours, the busiest cell.
export function makeFrequencyBlock(cells: FrequencyCell[]): FrequencyBlock {
  const sum = (match: (cell: FrequencyCell) => boolean) =>
    cells.filter(match).reduce(
      (total, cell) => ({
        count: total.count + cell.count,
        amount: total.amount + Number(cell.totalTnd),
      }),
      { count: 0, amount: 0 },
    );
  const all = sum(() => true);

  return {
    count: all.count,
    totalTnd: all.amount.toFixed(3),
    cells,
    weekdays: Array.from({ length: 7 }, (_, index) => {
      const weekday = index + 1;
      const total = sum((cell) => cell.weekday === weekday);

      return {
        weekday,
        days: 4,
        count: total.count,
        totalTnd: total.amount.toFixed(3),
        averageCount: total.count / 4,
        averageTnd: (total.amount / 4).toFixed(3),
      };
    }),
    hours: Array.from({ length: 24 }, (_, hour) => {
      const total = sum((cell) => cell.hour === hour);

      return { hour, count: total.count, totalTnd: total.amount.toFixed(3) };
    }),
    peak: [...cells].sort((left, right) => right.count - left.count)[0] ?? null,
  };
}

/// A morning rush on Saturdays, a quieter Monday, and orders due on Friday
/// afternoons.
export function makeAnalyticsFrequency(
  overrides: Partial<AnalyticsFrequency> = {},
): AnalyticsFrequency {
  return {
    period: analyticsPeriod,
    sales: makeFrequencyBlock([
      { weekday: 1, hour: 7, count: 20, totalTnd: "180.000" },
      { weekday: 1, hour: 8, count: 12, totalTnd: "96.000" },
      { weekday: 6, hour: 8, count: 48, totalTnd: "520.000" },
      { weekday: 6, hour: 9, count: 40, totalTnd: "410.000" },
    ]),
    orders: makeFrequencyBlock([
      { weekday: 5, hour: 16, count: 8, totalTnd: "640.000" },
    ]),
    ...overrides,
  };
}

export function makeAnalyticsProducts(
  overrides: Partial<AnalyticsProducts> = {},
): AnalyticsProducts {
  return {
    period: analyticsPeriod,
    totals: { revenueTnd: "4800.000", productsCount: 3 },
    items: [
      {
        productId: "baguette",
        name: "Baguette",
        categoryId: "bread",
        categoryName: "Pains",
        unitName: "Pièce",
        quantity: "6000.000000",
        documentsCount: 310,
        revenueTnd: "2400.000",
        lastSoldAt: "2026-09-30T17:40:00.000Z",
        costedRevenueTnd: "1800.000",
        marginTnd: "1080.000",
      },
      {
        productId: "croissant",
        name: "Croissant",
        categoryId: "pastry",
        categoryName: "Viennoiseries",
        unitName: "Pièce",
        quantity: "1200.000000",
        documentsCount: 180,
        revenueTnd: "1440.000",
        lastSoldAt: "2026-09-30T09:10:00.000Z",
        costedRevenueTnd: "900.000",
        marginTnd: "420.000",
      },
      {
        productId: "pain-complet",
        name: "Pain complet",
        categoryId: "bread",
        categoryName: "Pains",
        unitName: "Pièce",
        quantity: "800.000000",
        documentsCount: 95,
        revenueTnd: "960.000",
        lastSoldAt: "2026-09-29T08:00:00.000Z",
        costedRevenueTnd: "0.000",
        marginTnd: null,
      },
    ],
    categories: [
      { categoryId: "bread", name: "Pains", revenueTnd: "3360.000" },
      { categoryId: "pastry", name: "Viennoiseries", revenueTnd: "1440.000" },
    ],
    unsold: {
      count: 2,
      items: [
        { productId: "tarte", name: "Tarte aux pommes" },
        { productId: "fougasse", name: "Fougasse" },
      ],
    },
    ...overrides,
  };
}

export function makeAnalyticsCustomers(
  overrides: Partial<AnalyticsCustomers> = {},
): AnalyticsCustomers {
  return {
    period: analyticsPeriod,
    summary: {
      identifiedSalesCount: 60,
      identifiedRevenueTnd: "1200.000",
      anonymousSalesCount: 300,
      anonymousRevenueTnd: "2400.000",
      activeCount: 18,
      returningCount: 9,
      newCount: 4,
    },
    top: [
      {
        customerId: "hotel",
        name: "Hôtel du Lac",
        salesCount: 12,
        revenueTnd: "480.000",
        averageBasketTnd: "40.000",
        lastPurchaseAt: "2026-09-29T07:30:00.000Z",
      },
      {
        customerId: "cafe",
        name: "Café des Arts",
        salesCount: 20,
        revenueTnd: "300.000",
        averageBasketTnd: "15.000",
        lastPurchaseAt: "2026-09-30T06:45:00.000Z",
      },
    ],
    inactive: {
      thresholdDays: 60,
      count: 3,
      items: [
        {
          customerId: "restaurant",
          name: "Restaurant El Medina",
          lastPurchaseAt: "2026-06-12T08:00:00.000Z",
          daysSince: 110,
          salesCount: 34,
          revenueTnd: "2150.000",
        },
      ],
    },
    ...overrides,
  };
}
