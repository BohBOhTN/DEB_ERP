import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service.js";
import { resolvePeriod } from "./period.js";

/// Issue 021. The SQL runs against PostgreSQL in the integration suite;
/// these tests are about what the service does with the rows: kinds,
/// comparison window, zero-filled buckets, rates and the figures left out
/// without their permission. The double answers a raw query by a fragment
/// of its text.
type RawRoute = [fragment: string, rows: (values: unknown[]) => unknown[]];

/// 4 October 2026 in Tunis; the default window is 5 September to 4 October.
const now = new Date("2026-10-04T10:00:00.000Z");
const period = resolvePeriod({}, now);
const isPrevious = (values: unknown[]) =>
  values.some(
    (value) =>
      value instanceof Date &&
      value.getTime() === period.previous.start.getTime(),
  );

function makeService(routes: RawRoute[], models: Record<string, unknown> = {}) {
  const prisma = {
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      const route = routes.find(([fragment]) => text.includes(fragment));
      return Promise.resolve(route ? route[1](values) : []);
    }),
    ...models,
  } as unknown as PrismaClient;

  return new AnalyticsService(prisma);
}

describe("AnalyticsService purchases", () => {
  const routes: RawRoute[] = [
    [
      'to_char((p."purchase_date"',
      () => [
        { bucket: "2026-09-10", resale: false, total: "120.000" },
        { bucket: "2026-09-10", resale: true, total: "60.000" },
        { bucket: "2026-09-22", resale: false, total: "30.000" },
      ],
    ],
    // The comparison window, through the shared totals by kind.
    [
      "IS NOT NULL) AS resale,",
      (values) =>
        isPrevious(values)
          ? [
              { resale: false, total: "100.000" },
              { resale: true, total: "40.000" },
            ]
          : [],
    ],
    ['"supplier_ledger_entries" e', () => [{ due: "75.500" }]],
    [
      '"suppliers" s ON',
      () => [
        {
          supplier_id: "supplier-1",
          name: "Minoterie du Sud",
          purchases: 2,
          total: "150.000",
          resale_total: "0.000",
        },
        {
          supplier_id: "supplier-2",
          name: "Grossiste Boissons",
          purchases: 1,
          total: "60.000",
          resale_total: "60.000",
        },
      ],
    ],
    [
      '"raw_materials" r ON',
      () => [
        {
          raw_material_id: "raw-1",
          name: "Farine T55",
          unit_name: "Kilogramme",
          quantity: "120.000000",
          total: "150.000",
          purchases: 2,
          first_price: "1.200",
          last_price: "1.500",
          last_at: new Date("2026-09-22T00:00:00.000Z"),
        },
      ],
    ],
    [
      '"sale_lines" sl',
      () => [
        {
          product_id: "product-water",
          name: "Eau 1,5 L",
          unit_name: "Pièce",
          sale_price: "1.200",
          quantity: "72.000000",
          total: "60.000",
          purchases: 1,
          last_price: "0.850",
          last_at: new Date("2026-09-10T00:00:00.000Z"),
          sold_quantity: "48.000000",
          sold_revenue: "57.600",
        },
      ],
    ],
  ];
  const models = {
    purchase: {
      count: vi.fn(async (args: { where: { purchaseDate: { gte: Date } } }) =>
        args.where.purchaseDate.gte.getTime() ===
        period.previous.start.getTime()
          ? 2
          : 3,
      ),
    },
  };

  it("splits the window by kind and compares it with the window before", async () => {
    const service = makeService(routes, models);

    const purchases = await service.getPurchases({
      period,
      permissions: new Set(["analytics.view", "purchases.view", "margin.view"]),
    });

    expect(purchases.totals).toEqual({
      totalTnd: "210.000",
      previousTotalTnd: "140.000",
      rawMaterialsTnd: "150.000",
      previousRawMaterialsTnd: "100.000",
      resaleTnd: "60.000",
      previousResaleTnd: "40.000",
      purchasesCount: 3,
      previousPurchasesCount: 2,
      remainingDueTnd: "75.500",
    });
    // Thirty buckets, a day without a purchase is a zero and not a hole.
    expect(purchases.trend).toHaveLength(30);
    expect(purchases.trend[5]).toEqual({
      bucket: "2026-09-10",
      rawMaterialsTnd: "120.000",
      resaleTnd: "60.000",
    });
    expect(purchases.trend[0]).toEqual({
      bucket: "2026-09-05",
      rawMaterialsTnd: "0.000",
      resaleTnd: "0.000",
    });
    expect(purchases.suppliers).toEqual([
      {
        supplierId: "supplier-1",
        name: "Minoterie du Sud",
        purchasesCount: 2,
        totalTnd: "150.000",
        rawMaterialsTnd: "150.000",
        resaleTnd: "0.000",
      },
      {
        supplierId: "supplier-2",
        name: "Grossiste Boissons",
        purchasesCount: 1,
        totalTnd: "60.000",
        rawMaterialsTnd: "0.000",
        resaleTnd: "60.000",
      },
    ]);
  });

  it("prices a raw material per base unit and says how its price moved", async () => {
    const service = makeService(routes, models);

    const { rawMaterials } = await service.getPurchases({
      period,
      permissions: new Set(["analytics.view", "purchases.view"]),
    });

    expect(rawMaterials).toEqual([
      {
        rawMaterialId: "raw-1",
        name: "Farine T55",
        unitName: "Kilogramme",
        quantity: "120.000",
        totalTnd: "150.000",
        purchasesCount: 2,
        averagePriceTnd: "1.250",
        firstPriceTnd: "1.200",
        lastPriceTnd: "1.500",
        priceChangePercent: 25,
        lastPurchasedAt: new Date("2026-09-22T00:00:00.000Z"),
      },
    ]);
  });

  it("puts what was sold beside what was bought, and keeps the unit margin behind margin.view", async () => {
    const withMargin = await makeService(routes, models).getPurchases({
      period,
      permissions: new Set(["analytics.view", "purchases.view", "margin.view"]),
    });
    const without = await makeService(routes, models).getPurchases({
      period,
      permissions: new Set(["analytics.view", "purchases.view"]),
    });

    expect(withMargin.resaleProducts).toEqual([
      {
        productId: "product-water",
        name: "Eau 1,5 L",
        unitName: "Pièce",
        quantity: "72.000",
        totalTnd: "60.000",
        purchasesCount: 1,
        averagePriceTnd: "0.833",
        lastPriceTnd: "0.850",
        lastPurchasedAt: new Date("2026-09-10T00:00:00.000Z"),
        soldQuantity: "48.000",
        soldRevenueTnd: "57.600",
        salePriceTnd: "1.200",
        unitMarginTnd: "0.350",
      },
    ]);
    expect(without.resaleProducts[0]?.unitMarginTnd).toBeNull();
  });

  it("answers zeros on a window without a purchase", async () => {
    const service = makeService([], {
      purchase: { count: vi.fn().mockResolvedValue(0) },
    });

    const purchases = await service.getPurchases({
      period,
      permissions: new Set(["analytics.view", "purchases.view"]),
    });

    expect(purchases.totals).toMatchObject({
      totalTnd: "0.000",
      previousTotalTnd: "0.000",
      purchasesCount: 0,
      remainingDueTnd: "0.000",
    });
    expect(purchases.suppliers).toEqual([]);
    expect(
      purchases.trend.every((row) => row.rawMaterialsTnd === "0.000"),
    ).toBe(true);
  });
});

describe("AnalyticsService distributors", () => {
  const routes: RawRoute[] = [
    [
      'x."consignment" AS consignment',
      (values) =>
        isPrevious(values)
          ? [
              {
                bucket: "2026-08",
                consignment: false,
                total: "80.000",
                documents: 2,
              },
            ]
          : [
              {
                bucket: "2026-09-10",
                consignment: false,
                total: "50.000",
                documents: 1,
              },
              {
                bucket: "2026-09-10",
                consignment: true,
                total: "24.000",
                documents: 1,
              },
              {
                bucket: "2026-09-20",
                consignment: true,
                total: "36.000",
                documents: 2,
              },
            ],
    ],
    [
      'FROM "distributors" di',
      () => [
        {
          distributor_id: "distributor-1",
          name: "Épicerie du Port",
          direct: "50.000",
          direct_documents: 1,
          consignment: "60.000",
          consignment_documents: 3,
          sold_quantity: "50.000000",
          returned_quantity: "10.000000",
          unaccounted_quantity: "0.000000",
          last_at: new Date("2026-09-20T15:00:00.000Z"),
        },
        {
          distributor_id: "distributor-2",
          name: "Café Central",
          direct: "0.000",
          direct_documents: 0,
          consignment: "0.000",
          consignment_documents: 0,
          sold_quantity: "0.000000",
          returned_quantity: "0.000000",
          unaccounted_quantity: "0.000000",
          last_at: null,
        },
      ],
    ],
    [
      'x."settled_sold"',
      () => [
        {
          product_id: "product-1",
          name: "Baguette",
          unit_name: "Pièce",
          quantity: "50.000000",
          revenue: "50.000",
          settled_sold: "0.000000",
          returned: "0.000000",
          unaccounted: "0.000000",
          costed_revenue: "50.000",
          cost: "20.000",
        },
        {
          product_id: "product-2",
          name: "Croissant",
          unit_name: "Pièce",
          quantity: "50.000000",
          revenue: "60.000",
          settled_sold: "50.000000",
          returned: "10.000000",
          unaccounted: "0.000000",
          costed_revenue: null,
          cost: null,
        },
      ],
    ],
  ];
  const ledger = {
    distributorLedgerEntry: {
      groupBy: vi.fn().mockResolvedValue([
        {
          distributorId: "distributor-1",
          _sum: { amountTnd: new Prisma.Decimal("35.000") },
        },
        {
          distributorId: "distributor-9",
          _sum: { amountTnd: new Prisma.Decimal("5.000") },
        },
      ]),
    },
  };
  const everything = new Set([
    "analytics.view",
    "distributors.view",
    "distribution.balances.view",
    "margin.view",
  ]);

  it("sums the channel, splits it and compares it with the window before", async () => {
    const { totals, trend } = await makeService(routes, ledger).getDistributors(
      { period, permissions: everything },
    );

    expect(totals).toEqual({
      revenueTnd: "110.000",
      previousRevenueTnd: "80.000",
      directTnd: "50.000",
      consignmentTnd: "60.000",
      documentsCount: 4,
      previousDocumentsCount: 2,
      activeCount: 2,
      // Ten returned out of sixty settled.
      returnRatePercent: 17,
      // Every distributor's balance, active in the window or not.
      balanceTnd: "40.000",
    });
    expect(trend).toHaveLength(30);
    expect(trend[5]).toEqual({
      bucket: "2026-09-10",
      directTnd: "50.000",
      consignmentTnd: "24.000",
    });
  });

  it("describes each distributor with its return rate and its balance", async () => {
    const { distributors } = await makeService(routes, ledger).getDistributors({
      period,
      permissions: everything,
    });

    expect(distributors[0]).toEqual({
      distributorId: "distributor-1",
      name: "Épicerie du Port",
      revenueTnd: "110.000",
      directTnd: "50.000",
      consignmentTnd: "60.000",
      documentsCount: 4,
      soldQuantity: "50.000",
      returnedQuantity: "10.000",
      returnRatePercent: 17,
      lastActivityAt: new Date("2026-09-20T15:00:00.000Z"),
      balanceTnd: "35.000",
    });
    // Nothing settled from consignment: no rate rather than a zero.
    expect(distributors[1]).toMatchObject({
      returnRatePercent: null,
      balanceTnd: "0.000",
    });
  });

  it("ranks the products sold through distributors, with the margin on costed lines", async () => {
    const { products } = await makeService(routes, ledger).getDistributors({
      period,
      permissions: everything,
    });

    expect(products).toEqual([
      {
        productId: "product-1",
        name: "Baguette",
        unitName: "Pièce",
        quantity: "50.000",
        revenueTnd: "50.000",
        returnedQuantity: "0.000",
        returnRatePercent: null,
        marginTnd: "30.000",
      },
      {
        productId: "product-2",
        name: "Croissant",
        unitName: "Pièce",
        quantity: "50.000",
        revenueTnd: "60.000",
        returnedQuantity: "10.000",
        returnRatePercent: 17,
        marginTnd: null,
      },
    ]);
  });

  it("leaves the balances and the margin out without their permission", async () => {
    const groupBy = vi.fn();
    const result = await makeService(routes, {
      distributorLedgerEntry: { groupBy },
    }).getDistributors({
      period,
      permissions: new Set(["analytics.view", "distributors.view"]),
    });

    expect(groupBy).not.toHaveBeenCalled();
    expect(result.totals.balanceTnd).toBeNull();
    expect(result.distributors[0]?.balanceTnd).toBeNull();
    expect(result.products[0]?.marginTnd).toBeNull();
  });
});
