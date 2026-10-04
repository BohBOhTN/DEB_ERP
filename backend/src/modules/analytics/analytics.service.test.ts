import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service.js";
import { resolvePeriod } from "./period.js";

/// The SQL itself runs against PostgreSQL in the integration suite; these
/// tests are about what the service does with the rows: zero-filled
/// buckets, channels, comparison window, permission-scoped blocks and the
/// weekday averages. The double answers a raw query by a fragment of its
/// text, so a test names the query it feeds rather than its call order.
type RawRoute = [fragment: string, rows: (values: unknown[]) => unknown[]];

function makeRaw(routes: RawRoute[]) {
  return vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    const route = routes.find(([fragment]) => text.includes(fragment));

    return Promise.resolve(route ? route[1](values) : []);
  });
}

function makeModel() {
  return {
    aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  };
}

function makePrisma(routes: RawRoute[] = []) {
  const models = {
    sale: makeModel(),
    expense: makeModel(),
    expenseCategory: makeModel(),
    product: makeModel(),
    customer: makeModel(),
  };

  return {
    models,
    prisma: {
      $queryRaw: makeRaw(routes),
      ...models,
    } as unknown as PrismaClient,
  };
}

const money = (value: string) => new Prisma.Decimal(value);
/// 4 October 2026 in Tunis; the default window is 5 September to 4 October.
const now = new Date("2026-10-04T10:00:00.000Z");
const lastThirtyDays = resolvePeriod({}, now);
const salesBuckets = '"customer_orders" o ON o."sale_id"';
const distributorBuckets = '"distributor_settlements" t';
const isPrevious = (values: unknown[]) =>
  values.some(
    (value) =>
      value instanceof Date &&
      value.getTime() === lastThirtyDays.previous.start.getTime(),
  );

describe("AnalyticsService overview", () => {
  const routes: RawRoute[] = [
    [
      salesBuckets,
      (values) =>
        isPrevious(values)
          ? [
              {
                bucket: "2026-08-11",
                from_order: false,
                count: 2,
                total: "40.000",
                due: "0.000",
              },
            ]
          : [
              {
                bucket: "2026-09-10",
                from_order: false,
                count: 3,
                total: "30.000",
                due: "5.000",
              },
              {
                bucket: "2026-09-10",
                from_order: true,
                count: 1,
                total: "20.000",
                due: "0.000",
              },
              {
                bucket: "2026-09-12",
                from_order: false,
                count: 2,
                total: "10.000",
                due: "0.000",
              },
            ],
    ],
    [
      distributorBuckets,
      (values) =>
        isPrevious(values) ? [] : [{ bucket: "2026-09-12", total: "100.000" }],
    ],
    ['"expenses" e', () => [{ bucket: "2026-09-10", total: "12.500" }]],
    [
      "uncosted_lines",
      () => [
        {
          revenue: money("60.000"),
          costed_revenue: money("50.000"),
          cost: money("20.000"),
          uncosted_lines: 1n,
        },
      ],
    ],
  ];

  it("splits revenue by channel and compares it with the window before", async () => {
    const { prisma, models } = makePrisma(routes);
    models.sale.count.mockResolvedValue(1);

    const overview = await new AnalyticsService(prisma).getOverview({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });

    expect(overview.period).toEqual({
      from: "2026-09-05",
      to: "2026-10-04",
      days: 30,
      granularity: "day",
      previousFrom: "2026-08-06",
      previousTo: "2026-09-04",
    });
    expect(overview.revenue).toEqual({
      totalTnd: "160.000",
      previousTotalTnd: "40.000",
      counterTnd: "40.000",
      ordersTnd: "20.000",
      distributorsTnd: "100.000",
    });
    // Distributor documents are revenue, never baskets.
    expect(overview.sales).toEqual({
      count: 6,
      previousCount: 2,
      averageBasketTnd: "10.000",
      previousAverageBasketTnd: "20.000",
      remainingDueTnd: "5.000",
      cancelledCount: 1,
    });
    expect(overview.bestBucket).toEqual({
      bucket: "2026-09-12",
      revenueTnd: "110.000",
    });
  });

  it("fills every day of the window and aligns the previous window by rank", async () => {
    const { prisma } = makePrisma(routes);

    const { trend } = await new AnalyticsService(prisma).getOverview({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });

    expect(trend).toHaveLength(30);
    expect(trend[0]).toEqual({
      bucket: "2026-09-05",
      revenueTnd: "0.000",
      salesCount: 0,
      expensesTnd: null,
      previousRevenueTnd: "0.000",
    });
    // 10 September is the sixth day; so is 11 August in the window before.
    expect(trend[5]).toEqual({
      bucket: "2026-09-10",
      revenueTnd: "50.000",
      salesCount: 4,
      expensesTnd: null,
      previousRevenueTnd: "40.000",
    });
  });

  it("leaves expenses and margin out without their permissions", async () => {
    const { prisma, models } = makePrisma(routes);

    const overview = await new AnalyticsService(prisma).getOverview({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });

    expect(overview.expenses).toBeNull();
    expect(overview.margin).toBeNull();
    expect(models.expense.groupBy).not.toHaveBeenCalled();
  });

  it("adds expenses by category and the approximate margin with their permissions", async () => {
    const { prisma, models } = makePrisma(routes);
    models.expense.groupBy.mockResolvedValue([
      { categoryId: "rent", _sum: { amountTnd: money("4.500") } },
      { categoryId: "energy", _sum: { amountTnd: money("8.000") } },
    ]);
    models.expense.aggregate.mockResolvedValue({
      _sum: { amountTnd: money("25.000") },
    });
    models.expenseCategory.findMany.mockResolvedValue([
      { id: "rent", name: "Loyer" },
      { id: "energy", name: "Énergie" },
    ]);

    const overview = await new AnalyticsService(prisma).getOverview({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view", "expenses.view", "margin.view"]),
    });

    expect(overview.expenses).toEqual({
      totalTnd: "12.500",
      previousTotalTnd: "25.000",
      byCategory: [
        { categoryId: "energy", name: "Énergie", totalTnd: "8.000" },
        { categoryId: "rent", name: "Loyer", totalTnd: "4.500" },
      ],
    });
    expect(overview.trend[5]?.expensesTnd).toBe("12.500");
    expect(overview.trend[6]?.expensesTnd).toBe("0.000");
    expect(overview.margin?.current).toEqual({
      revenueTnd: "60.000",
      costedRevenueTnd: "50.000",
      costTnd: "20.000",
      marginTnd: "30.000",
      uncostedLinesCount: 1,
    });
  });

  it("buckets a long window by month without a comparison line", async () => {
    const { prisma } = makePrisma([
      [
        salesBuckets,
        (values) =>
          values.some(
            (value) =>
              value instanceof Date &&
              value.toISOString() === "2025-12-31T23:00:00.000Z",
          )
            ? [
                {
                  bucket: "2026-03",
                  from_order: false,
                  count: 10,
                  total: "900.000",
                  due: "0.000",
                },
              ]
            : [],
      ],
    ]);

    const overview = await new AnalyticsService(prisma).getOverview({
      period: resolvePeriod({ from: "2026-01-01", to: "2026-06-30" }, now),
      permissions: new Set(["analytics.view"]),
    });

    expect(overview.trend.map((row) => row.bucket)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(overview.trend[2]).toMatchObject({
      revenueTnd: "900.000",
      salesCount: 10,
      previousRevenueTnd: null,
    });
    expect(overview.sales.averageBasketTnd).toBe("90.000");
    expect(overview.sales.previousAverageBasketTnd).toBeNull();
  });
});

describe("AnalyticsService frequency", () => {
  const routes: RawRoute[] = [
    [
      '"requested_fulfillment_at"',
      () => [{ weekday: 5, hour: 16, count: 3, total: "210.000" }],
    ],
    [
      "ISODOW",
      () => [
        { weekday: 6, hour: 7, count: 5, total: "70.000" },
        { weekday: 1, hour: 8, count: 2, total: "10.000" },
        { weekday: 1, hour: 7, count: 4, total: "40.000" },
      ],
    ],
  ];

  it("averages a weekday over its occurrences in the window", async () => {
    const { prisma } = makePrisma(routes);

    const { sales } = await new AnalyticsService(prisma).getFrequency({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });

    expect(sales.count).toBe(11);
    expect(sales.totalTnd).toBe("120.000");
    expect(sales.cells.map((cell) => [cell.weekday, cell.hour])).toEqual([
      [1, 7],
      [1, 8],
      [6, 7],
    ]);
    // 5 September to 4 October 2026 holds four Mondays and five Saturdays.
    expect(sales.weekdays[0]).toEqual({
      weekday: 1,
      days: 4,
      count: 6,
      totalTnd: "50.000",
      averageCount: 1.5,
      averageTnd: "12.500",
    });
    expect(sales.weekdays[5]).toEqual({
      weekday: 6,
      days: 5,
      count: 5,
      totalTnd: "70.000",
      averageCount: 1,
      averageTnd: "14.000",
    });
    expect(sales.weekdays[2]).toMatchObject({ weekday: 3, days: 4, count: 0 });
    expect(sales.hours).toHaveLength(24);
    expect(sales.hours[7]).toEqual({ hour: 7, count: 9, totalTnd: "110.000" });
    expect(sales.peak).toEqual({
      weekday: 6,
      hour: 7,
      count: 5,
      totalTnd: "70.000",
    });
  });

  it("shows order pickups only with orders.view", async () => {
    const service = new AnalyticsService(makePrisma(routes).prisma);

    const without = await service.getFrequency({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });
    const withOrders = await service.getFrequency({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view", "orders.view"]),
    });

    expect(without.orders).toBeNull();
    expect(withOrders.orders?.peak).toEqual({
      weekday: 5,
      hour: 16,
      count: 3,
      totalTnd: "210.000",
    });
  });

  it("answers an empty window with zeros and no peak", async () => {
    const { sales } = await new AnalyticsService(
      makePrisma().prisma,
    ).getFrequency({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });

    expect(sales.count).toBe(0);
    expect(sales.cells).toEqual([]);
    expect(sales.peak).toBeNull();
    expect(sales.weekdays).toHaveLength(7);
  });
});

describe("AnalyticsService products", () => {
  const soldAt = new Date("2026-09-20T07:15:00.000Z");
  const routes: RawRoute[] = [
    [
      '"sale_lines" sl',
      () => [
        {
          product_id: "baguette",
          name: "Baguette",
          category_id: "bread",
          category_name: "Pains",
          unit_name: "Pièce",
          quantity: "400.000000",
          documents: 120,
          revenue: "100.000",
          costed_revenue: "80.000",
          cost: "32.0000000",
          last_sold_at: soldAt,
        },
        {
          product_id: "croissant",
          name: "Croissant",
          category_id: "pastry",
          category_name: "Viennoiseries",
          unit_name: "Pièce",
          quantity: "50.000000",
          documents: 30,
          revenue: "60.000",
          costed_revenue: null,
          cost: null,
          last_sold_at: soldAt,
        },
        {
          product_id: "pain-complet",
          name: "Pain complet",
          category_id: "bread",
          category_name: "Pains",
          unit_name: "Pièce",
          quantity: "20.000000",
          documents: 12,
          revenue: "30.000",
          costed_revenue: "30.000",
          cost: "12.000",
          last_sold_at: soldAt,
        },
      ],
    ],
  ];

  it("ranks products, sums categories and lists what did not sell", async () => {
    const { prisma, models } = makePrisma(routes);
    models.product.count.mockResolvedValue(1);
    models.product.findMany.mockResolvedValue([{ id: "tarte", name: "Tarte" }]);

    const products = await new AnalyticsService(prisma).getProducts({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view", "margin.view"]),
    });

    expect(products.totals).toEqual({
      revenueTnd: "190.000",
      productsCount: 3,
    });
    expect(products.items[0]).toEqual({
      productId: "baguette",
      name: "Baguette",
      categoryId: "bread",
      categoryName: "Pains",
      unitName: "Pièce",
      quantity: "400.000000",
      documentsCount: 120,
      revenueTnd: "100.000",
      lastSoldAt: soldAt,
      costedRevenueTnd: "80.000",
      marginTnd: "48.000",
    });
    // Never costed: no margin rather than a margin equal to the revenue.
    expect(products.items[1]).toMatchObject({
      productId: "croissant",
      costedRevenueTnd: "0.000",
      marginTnd: null,
    });
    expect(products.categories).toEqual([
      { categoryId: "bread", name: "Pains", revenueTnd: "130.000" },
      { categoryId: "pastry", name: "Viennoiseries", revenueTnd: "60.000" },
    ]);
    expect(products.unsold).toEqual({
      count: 1,
      items: [{ productId: "tarte", name: "Tarte" }],
    });
    expect(models.product.count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        id: { notIn: ["baguette", "croissant", "pain-complet"] },
      },
    });
  });

  it("hides every cost figure without margin.view", async () => {
    const products = await new AnalyticsService(
      makePrisma(routes).prisma,
    ).getProducts({
      period: lastThirtyDays,
      permissions: new Set(["analytics.view"]),
    });

    expect(
      products.items.every(
        (item) => item.marginTnd === null && item.costedRevenueTnd === null,
      ),
    ).toBe(true);
  });
});

describe("AnalyticsService customers", () => {
  it("separates identified from anonymous sales and names who to win back", async () => {
    const lastAt = new Date("2026-07-01T09:00:00.000Z");
    const { prisma, models } = makePrisma([
      ["repeat_count", () => [{ active_count: 8, repeat_count: 3 }]],
      ["new_count", () => [{ new_count: 2 }]],
      [
        "full_count",
        () => [
          {
            customer_id: "cafe",
            name: "Café des Arts",
            last_at: lastAt,
            sales_count: 14,
            total: "1250.000",
            full_count: 6,
          },
        ],
      ],
    ]);
    models.sale.aggregate.mockImplementation(
      (args: { where: { customerId: unknown } }) =>
        Promise.resolve(
          args.where.customerId === null
            ? { _count: { _all: 40 }, _sum: { totalTnd: money("300.000") } }
            : { _count: { _all: 10 }, _sum: { totalTnd: money("500.000") } },
        ),
    );
    models.sale.groupBy.mockResolvedValue([
      {
        customerId: "hotel",
        _count: { _all: 4 },
        _sum: { totalTnd: money("320.000") },
        _max: { soldAt: new Date("2026-10-01T08:00:00.000Z") },
      },
    ]);
    models.customer.findMany.mockResolvedValue([
      { id: "hotel", name: "Hôtel du Lac" },
    ]);

    const customers = await new AnalyticsService(prisma).getCustomers(
      {
        period: lastThirtyDays,
        permissions: new Set(["analytics.view", "customers.view"]),
      },
      now,
    );

    expect(customers.summary).toEqual({
      identifiedSalesCount: 10,
      identifiedRevenueTnd: "500.000",
      anonymousSalesCount: 40,
      anonymousRevenueTnd: "300.000",
      activeCount: 8,
      returningCount: 3,
      newCount: 2,
    });
    expect(customers.top).toEqual([
      {
        customerId: "hotel",
        name: "Hôtel du Lac",
        salesCount: 4,
        revenueTnd: "320.000",
        averageBasketTnd: "80.000",
        lastPurchaseAt: new Date("2026-10-01T08:00:00.000Z"),
      },
    ]);
    expect(customers.inactive).toEqual({
      thresholdDays: 60,
      count: 6,
      items: [
        {
          customerId: "cafe",
          name: "Café des Arts",
          lastPurchaseAt: lastAt,
          daysSince: 95,
          salesCount: 14,
          revenueTnd: "1250.000",
        },
      ],
    });
  });
});
