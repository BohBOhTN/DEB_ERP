import {
  CustomerOrderStatus,
  DistributorDispatchStatus,
  ExpenseStatus,
  PosSessionStatus,
  PrismaClient,
  PurchasePaymentTerms,
  PurchaseStatus,
  SalePaymentState,
  SaleStatus,
  SupplierLedgerEntryType,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PosService } from "../pos/pos.service.js";
import { AnalyticsService } from "./analytics.service.js";
import { resolvePeriod } from "./period.js";

/// Issue 014: the analyses are raw SQL (Tunis days and hours, channel
/// unions, distinct documents), which only PostgreSQL can prove. The suite
/// writes a small history dated March 2001, a month no other suite touches,
/// so its totals are exact even though the CI database is shared with the
/// suites running beside it.
///
/// Point INTEGRATION_DATABASE_URL at a throwaway database. Never the shared
/// remote development database: this suite writes and deletes rows.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (process.env.REQUIRE_INTEGRATION_TESTS && !integrationDatabaseUrl) {
  throw new Error(
    "REQUIRE_INTEGRATION_TESTS is set but INTEGRATION_DATABASE_URL is missing.",
  );
}

type Seeded = Awaited<ReturnType<typeof seedHistory>>;

const runId = Math.random().toString(36).slice(2, 10);
const suite = integrationDatabaseUrl ? describe : describe.skip;
const everything = new Set([
  "analytics.view",
  "expenses.view",
  "margin.view",
  "orders.view",
  "customers.view",
  "purchases.view",
  "distributors.view",
  "distribution.balances.view",
]);
/// Tunis was UTC+1 all year in 2001; 5 March 2001 is a Monday.
const march = resolvePeriod({ from: "2001-03-01", to: "2001-03-31" });

suite("AnalyticsService on PostgreSQL", () => {
  let prisma: PrismaClient;
  let service: AnalyticsService;
  let seeded: Seeded;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: integrationDatabaseUrl as string } },
    });
    service = new AnalyticsService(prisma);
    seeded = await seedHistory(prisma);
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      await cleanUp(prisma, seeded);
      await prisma.$disconnect();
    }
  }, 60_000);

  it("sums revenue by channel on posted documents, bucketed by Tunis day", async () => {
    const overview = await service.getOverview({
      period: march,
      permissions: everything,
    });
    const bucket = (day: string) =>
      overview.trend.find((row) => row.bucket === day);

    expect(overview.revenue).toEqual({
      totalTnd: "114.500",
      previousTotalTnd: "0.000",
      counterTnd: "36.000",
      ordersTnd: "4.500",
      distributorsTnd: "74.000",
    });
    // The cancelled sale of 99 TND counts nowhere but here.
    expect(overview.sales).toEqual({
      count: 4,
      previousCount: 0,
      averageBasketTnd: "10.125",
      previousAverageBasketTnd: null,
      remainingDueTnd: "15.000",
      cancelledCount: 1,
    });
    expect(overview.trend).toHaveLength(31);
    expect(bucket("2001-03-05")).toMatchObject({
      revenueTnd: "10.000",
      salesCount: 1,
    });
    // Posted at 23:30 UTC on the 5th: half past midnight on the 6th in Tunis.
    expect(bucket("2001-03-06")).toMatchObject({
      revenueTnd: "6.000",
      salesCount: 1,
      expensesTnd: "12.500",
    });
    expect(bucket("2001-03-07")).toMatchObject({
      revenueTnd: "50.000",
      salesCount: 0,
    });
    expect(bucket("2001-03-08")).toMatchObject({ revenueTnd: "24.000" });
    expect(bucket("2001-03-10")).toMatchObject({
      revenueTnd: "24.500",
      salesCount: 2,
    });
    expect(overview.bestBucket).toEqual({
      bucket: "2001-03-07",
      revenueTnd: "50.000",
    });
    expect(overview.expenses).toEqual({
      totalTnd: "12.500",
      previousTotalTnd: "0.000",
      byCategory: [
        {
          categoryId: seeded.expenseCategory.id,
          name: seeded.expenseCategory.name,
          totalTnd: "12.500",
        },
      ],
    });
    expect(overview.margin?.current).toEqual({
      revenueTnd: "40.500",
      costedRevenueTnd: "30.000",
      costTnd: "12.000",
      marginTnd: "18.000",
      uncostedLinesCount: 2,
    });
  }, 60_000);

  it("buckets a long window by month", async () => {
    const overview = await service.getOverview({
      period: resolvePeriod({ from: "2001-01-01", to: "2001-06-30" }),
      permissions: new Set(["analytics.view"]),
    });

    expect(overview.period.granularity).toBe("month");
    expect(
      overview.trend.map((row) => [row.bucket, row.revenueTnd, row.salesCount]),
    ).toEqual([
      ["2001-01", "3.000", 1],
      ["2001-02", "0.000", 0],
      ["2001-03", "114.500", 4],
      ["2001-04", "0.000", 0],
      ["2001-05", "0.000", 0],
      ["2001-06", "0.000", 0],
    ]);
  }, 60_000);

  it("places sales and order pickups on the Tunis weekday and hour", async () => {
    const frequency = await service.getFrequency({
      period: march,
      permissions: everything,
    });

    expect(frequency.sales.count).toBe(4);
    expect(frequency.sales.cells).toEqual([
      { weekday: 1, hour: 7, count: 1, totalTnd: "10.000" },
      { weekday: 2, hour: 0, count: 1, totalTnd: "6.000" },
      { weekday: 6, hour: 9, count: 2, totalTnd: "24.500" },
    ]);
    expect(frequency.sales.peak).toEqual({
      weekday: 6,
      hour: 9,
      count: 2,
      totalTnd: "24.500",
    });
    // March 2001 holds five Saturdays.
    expect(frequency.sales.weekdays[5]).toEqual({
      weekday: 6,
      days: 5,
      count: 2,
      totalTnd: "24.500",
      averageCount: 0.4,
      averageTnd: "4.900",
    });
    // The cancelled order is left out.
    expect(frequency.orders?.cells).toEqual([
      { weekday: 1, hour: 16, count: 1, totalTnd: "30.000" },
      { weekday: 6, hour: 9, count: 1, totalTnd: "4.500" },
    ]);
  }, 60_000);

  it("ranks products over every channel and counts distinct documents", async () => {
    const products = await service.getProducts({
      period: march,
      permissions: everything,
    });

    expect(products.totals).toEqual({
      revenueTnd: "114.500",
      productsCount: 2,
    });
    expect(products.items).toEqual([
      {
        productId: seeded.baguette.id,
        name: seeded.baguette.name,
        categoryId: seeded.category.id,
        categoryName: seeded.category.name,
        unitName: "Pièce",
        // Till 10 + 20, distributor sale 50.
        quantity: "80.000000",
        documentsCount: 3,
        revenueTnd: "80.000",
        lastSoldAt: new Date("2001-03-10T08:15:00.000Z"),
        costedRevenueTnd: "30.000",
        marginTnd: "18.000",
      },
      {
        productId: seeded.croissant.id,
        name: seeded.croissant.name,
        categoryId: seeded.category.id,
        categoryName: seeded.category.name,
        unitName: "Pièce",
        // Till 4 + 3, settlement sold 20 (the 10 returned are not sales).
        quantity: "27.000000",
        documentsCount: 3,
        revenueTnd: "34.500",
        lastSoldAt: new Date("2001-03-10T08:45:00.000Z"),
        costedRevenueTnd: "0.000",
        marginTnd: null,
      },
    ]);
    expect(products.categories).toEqual([
      {
        categoryId: seeded.category.id,
        name: seeded.category.name,
        revenueTnd: "114.500",
      },
    ]);
    // The tart never sold; whatever else the database holds, the two sold
    // products are not in the unsold list.
    expect(products.unsold.count).toBeGreaterThanOrEqual(1);
    expect(
      products.unsold.items.some((item) =>
        [seeded.baguette.id, seeded.croissant.id].includes(item.productId),
      ),
    ).toBe(false);
  }, 60_000);

  it("segments customers and finds the ones who stopped buying", async () => {
    // Read as of 1 June 2001: only this suite's customers had stopped
    // buying by then, so the list is exact.
    const customers = await service.getCustomers(
      { period: march, permissions: everything },
      new Date("2001-06-01T00:00:00.000Z"),
    );

    // Amel bought twice in March for the first time; Bechir bought once and
    // already had a sale in January, so he is neither new nor returning.
    expect(customers.summary).toEqual({
      identifiedSalesCount: 3,
      identifiedRevenueTnd: "30.500",
      anonymousSalesCount: 1,
      anonymousRevenueTnd: "10.000",
      activeCount: 2,
      returningCount: 1,
      newCount: 1,
    });
    expect(customers.top).toEqual([
      {
        customerId: seeded.amel.id,
        name: seeded.amel.name,
        salesCount: 2,
        revenueTnd: "26.000",
        averageBasketTnd: "13.000",
        lastPurchaseAt: new Date("2001-03-10T08:15:00.000Z"),
      },
      {
        customerId: seeded.bechir.id,
        name: seeded.bechir.name,
        salesCount: 1,
        revenueTnd: "4.500",
        averageBasketTnd: "4.500",
        lastPurchaseAt: new Date("2001-03-10T08:45:00.000Z"),
      },
    ]);
    expect(customers.inactive).toEqual({
      thresholdDays: 60,
      count: 2,
      items: [
        {
          customerId: seeded.amel.id,
          name: seeded.amel.name,
          lastPurchaseAt: new Date("2001-03-10T08:15:00.000Z"),
          daysSince: 82,
          salesCount: 2,
          revenueTnd: "26.000",
        },
        {
          customerId: seeded.bechir.id,
          name: seeded.bechir.name,
          lastPurchaseAt: new Date("2001-03-10T08:45:00.000Z"),
          daysSince: 82,
          salesCount: 2,
          revenueTnd: "7.500",
        },
      ],
    });
  }, 60_000);

  // Issue 021: purchases by kind. March holds flour bought twice at two
  // prices and croissants bought to be resold; a cancelled purchase and a
  // February one stay out of the window.
  it("splits the purchases between raw materials and resold products", async () => {
    const purchases = await service.getPurchases({
      period: march,
      permissions: everything,
    });

    expect(purchases.totals).toEqual({
      totalTnd: "35.200",
      previousTotalTnd: "3.000",
      rawMaterialsTnd: "16.000",
      previousRawMaterialsTnd: "3.000",
      resaleTnd: "19.200",
      previousResaleTnd: "0.000",
      purchasesCount: 2,
      previousPurchasesCount: 1,
      // 29.200 owed less 9.200 paid at posting, plus 6.000 unpaid.
      remainingDueTnd: "26.000",
    });
    expect(
      purchases.trend.filter(
        (row) => row.rawMaterialsTnd !== "0.000" || row.resaleTnd !== "0.000",
      ),
    ).toEqual([
      { bucket: "2001-03-06", rawMaterialsTnd: "10.000", resaleTnd: "19.200" },
      { bucket: "2001-03-20", rawMaterialsTnd: "6.000", resaleTnd: "0.000" },
    ]);
    expect(purchases.trend).toHaveLength(31);
    expect(purchases.suppliers).toEqual([
      {
        supplierId: seeded.supplier.id,
        name: seeded.supplier.name,
        purchasesCount: 2,
        totalTnd: "35.200",
        rawMaterialsTnd: "16.000",
        resaleTnd: "19.200",
      },
    ]);
    expect(purchases.rawMaterials).toEqual([
      expect.objectContaining({
        rawMaterialId: seeded.flour.id,
        quantity: "15.000",
        totalTnd: "16.000",
        purchasesCount: 2,
        averagePriceTnd: "1.067",
        firstPriceTnd: "1.000",
        lastPriceTnd: "1.200",
        priceChangePercent: 20,
      }),
    ]);
    // Bought 24, sold 27 over the window on the three channels: 4 and 3 at
    // the till, 20 through the settlement.
    expect(purchases.resaleProducts).toEqual([
      expect.objectContaining({
        productId: seeded.croissant.id,
        quantity: "24.000",
        totalTnd: "19.200",
        purchasesCount: 1,
        averagePriceTnd: "0.800",
        lastPriceTnd: "0.800",
        soldQuantity: "27.000",
        soldRevenueTnd: "34.500",
        salePriceTnd: "1.500",
        unitMarginTnd: "0.700",
      }),
    ]);

    const withoutMargin = await service.getPurchases({
      period: march,
      permissions: new Set(["analytics.view", "purchases.view"]),
    });
    expect(withoutMargin.resaleProducts[0]?.unitMarginTnd).toBeNull();
  });

  // Issue 021: the distributor channel. One direct sale of 50 and one
  // settlement of thirty croissants, twenty sold and ten returned.
  it("reads the distributor channel: revenue, returns and products", async () => {
    const distributors = await service.getDistributors({
      period: march,
      permissions: everything,
    });

    expect(distributors.totals).toMatchObject({
      revenueTnd: "74.000",
      previousRevenueTnd: "0.000",
      directTnd: "50.000",
      consignmentTnd: "24.000",
      documentsCount: 2,
      previousDocumentsCount: 0,
      activeCount: 1,
      returnRatePercent: 33,
    });
    expect(
      distributors.trend.filter(
        (row) => row.directTnd !== "0.000" || row.consignmentTnd !== "0.000",
      ),
    ).toEqual([
      { bucket: "2001-03-07", directTnd: "50.000", consignmentTnd: "0.000" },
      { bucket: "2001-03-08", directTnd: "0.000", consignmentTnd: "24.000" },
    ]);
    expect(distributors.distributors).toEqual([
      expect.objectContaining({
        distributorId: seeded.distributor.id,
        revenueTnd: "74.000",
        directTnd: "50.000",
        consignmentTnd: "24.000",
        documentsCount: 2,
        soldQuantity: "20.000",
        returnedQuantity: "10.000",
        returnRatePercent: 33,
        balanceTnd: "0.000",
      }),
    ]);
    expect(distributors.products).toEqual([
      expect.objectContaining({
        productId: seeded.baguette.id,
        quantity: "50.000",
        revenueTnd: "50.000",
        returnedQuantity: "0.000",
        returnRatePercent: null,
        marginTnd: null,
      }),
      expect.objectContaining({
        productId: seeded.croissant.id,
        quantity: "20.000",
        revenueTnd: "24.000",
        returnedQuantity: "10.000",
        returnRatePercent: 33,
      }),
    ]);

    const withoutBalances = await service.getDistributors({
      period: march,
      permissions: new Set(["analytics.view", "distributors.view"]),
    });
    expect(withoutBalances.totals.balanceTnd).toBeNull();
    expect(withoutBalances.distributors[0]?.balanceTnd).toBeNull();
  });

  it("describes a till session: totals of the history, hours and best products", async () => {
    const pos = new PosService(prisma);
    const [summary, detail] = await Promise.all([
      pos.summarizeSessions({ from: march.start, to: march.end }),
      pos.getSession(seeded.session.id),
    ]);

    expect(summary).toEqual({
      count: 1,
      openCount: 0,
      closedCount: 1,
      salesCount: 5,
      salesTotalTnd: "43.500",
      differenceTnd: "-2.000",
      shortageTnd: "-2.000",
      surplusTnd: "0.000",
      withDifferenceCount: 1,
    });
    expect(detail.insights).toEqual({
      averageBasketTnd: "8.700",
      cancelledSalesCount: 1,
      hourly: [
        { hour: 0, count: 1, totalTnd: "6.000" },
        { hour: 7, count: 1, totalTnd: "10.000" },
        { hour: 9, count: 2, totalTnd: "24.500" },
        { hour: 10, count: 1, totalTnd: "3.000" },
      ],
      topProducts: [
        {
          productId: seeded.baguette.id,
          name: seeded.baguette.name,
          unitName: "Pièce",
          quantity: "30.000000",
          revenueTnd: "30.000",
        },
        {
          productId: seeded.croissant.id,
          name: seeded.croissant.name,
          unitName: "Pièce",
          quantity: "9.000000",
          revenueTnd: "13.500",
        },
      ],
    });
  }, 60_000);
});

async function seedHistory(prisma: PrismaClient) {
  const user = await prisma.user.create({
    data: {
      email: `analytics+${runId}@dar-el-barka.test`,
      displayName: `Analytics ${runId}`,
      passwordHash: "not-a-real-hash",
    },
  });
  const by = { createdByUserId: user.id, updatedByUserId: user.id };
  const unit = await prisma.unit.create({
    data: { code: `AN-${runId}`, name: "Pièce", symbol: "pc" },
  });
  const category = await prisma.productCategory.create({
    data: {
      name: `Pains ${runId}`,
      normalizedName: `pains ${runId}`,
      ...by,
    },
  });
  const product = (name: string, price: string) =>
    prisma.product.create({
      data: {
        name: `${name} ${runId}`,
        normalizedName: `${name.toLowerCase()} ${runId}`,
        categoryId: category.id,
        baseUnitId: unit.id,
        salePriceTnd: price,
        ...by,
      },
    });
  const baguette = await product("Baguette", "1.000");
  const croissant = await product("Croissant", "1.500");
  const tart = await product("Tarte", "9.000");
  const customer = (name: string) =>
    prisma.customer.create({
      data: {
        name: `${name} ${runId}`,
        normalizedName: `${name.toLowerCase()} ${runId}`,
        ...by,
      },
    });
  const amel = await customer("Amel");
  const bechir = await customer("Bechir");
  const terminal = await prisma.posTerminal.create({
    data: { code: `an-${runId}`, name: `Caisse ${runId}` },
  });
  // A closed session owns every sale, so the one-open-session rule of the
  // suites running beside this one is never touched.
  const session = await prisma.posSession.create({
    data: {
      terminalId: terminal.id,
      status: PosSessionStatus.CLOSED,
      openedAt: new Date("2001-03-05T05:00:00.000Z"),
      closedAt: new Date("2001-03-05T18:00:00.000Z"),
      openedByUserId: user.id,
      closedByUserId: user.id,
      openingCashTnd: "20.000",
      expectedCashTnd: "60.000",
      countedCashTnd: "58.000",
      cashDifferenceTnd: "-2.000",
    },
  });
  let reference = 0;
  const sale = (input: {
    soldAt: string;
    totalTnd: string;
    paidTnd?: string;
    customerId?: string;
    cancelled?: boolean;
    line: {
      product: { id: string; name: string };
      quantity: string;
      unitPriceTnd: string;
      unitCostTnd?: string;
    };
  }) => {
    const soldAt = new Date(input.soldAt);
    const paid = input.paidTnd ?? input.totalTnd;
    const remaining = (Number(input.totalTnd) - Number(paid)).toFixed(3);
    reference += 1;

    return prisma.sale.create({
      data: {
        reference: `VT-AN-${runId}-${reference}`,
        sessionId: session.id,
        customerId: input.customerId,
        status: input.cancelled ? SaleStatus.CANCELLED : SaleStatus.POSTED,
        paymentState:
          Number(remaining) === 0
            ? SalePaymentState.PAID
            : SalePaymentState.PARTIALLY_PAID,
        soldAt,
        postedAt: soldAt,
        postedByUserId: user.id,
        totalTnd: input.totalTnd,
        paidAmountTnd: paid,
        remainingDueTnd: remaining,
        ...(input.cancelled
          ? {
              cancelledAt: soldAt,
              cancelledByUserId: user.id,
              cancellationReason: "Erreur de saisie",
            }
          : {}),
        lines: {
          create: {
            productId: input.line.product.id,
            unitId: unit.id,
            quantity: input.line.quantity,
            unitPriceTnd: input.line.unitPriceTnd,
            unitCostTnd: input.line.unitCostTnd,
            lineTotalTnd: input.totalTnd,
            productNameSnapshot: input.line.product.name,
            unitNameSnapshot: unit.name,
          },
        },
      },
    });
  };

  // January: an older sale, so Bechir is not a new customer in March.
  await sale({
    soldAt: "2001-01-15T09:00:00.000Z",
    totalTnd: "3.000",
    customerId: bechir.id,
    line: { product: croissant, quantity: "2", unitPriceTnd: "1.500" },
  });
  // Monday 5 March, 07:30 in Tunis, anonymous.
  await sale({
    soldAt: "2001-03-05T06:30:00.000Z",
    totalTnd: "10.000",
    line: {
      product: baguette,
      quantity: "10",
      unitPriceTnd: "1.000",
      unitCostTnd: "0.400",
    },
  });
  // 23:30 UTC on the 5th is Tuesday 6 March, 00:30 in Tunis.
  await sale({
    soldAt: "2001-03-05T23:30:00.000Z",
    totalTnd: "6.000",
    customerId: amel.id,
    line: { product: croissant, quantity: "4", unitPriceTnd: "1.500" },
  });
  // Saturday 10 March, 09:15 in Tunis, partly on credit.
  await sale({
    soldAt: "2001-03-10T08:15:00.000Z",
    totalTnd: "20.000",
    paidTnd: "5.000",
    customerId: amel.id,
    line: {
      product: baguette,
      quantity: "20",
      unitPriceTnd: "1.000",
      unitCostTnd: "0.400",
    },
  });
  // Saturday 10 March, 09:45 in Tunis: the sale an order produced.
  const orderSale = await sale({
    soldAt: "2001-03-10T08:45:00.000Z",
    totalTnd: "4.500",
    customerId: bechir.id,
    line: { product: croissant, quantity: "3", unitPriceTnd: "1.500" },
  });
  await sale({
    soldAt: "2001-03-07T10:00:00.000Z",
    totalTnd: "99.000",
    cancelled: true,
    line: { product: baguette, quantity: "99", unitPriceTnd: "1.000" },
  });

  const order = (input: {
    index: number;
    status: CustomerOrderStatus;
    customerId: string;
    requestedFulfillmentAt: string;
    totalTnd: string;
    saleId?: string;
  }) =>
    prisma.customerOrder.create({
      data: {
        reference: `CMD-AN-${runId}-${input.index}`,
        customerId: input.customerId,
        status: input.status,
        requestedFulfillmentAt: new Date(input.requestedFulfillmentAt),
        totalTnd: input.totalTnd,
        saleId: input.saleId,
        ...(input.status === CustomerOrderStatus.COMPLETED
          ? {
              completedAt: new Date(input.requestedFulfillmentAt),
              completedByUserId: user.id,
            }
          : {}),
        ...(input.status === CustomerOrderStatus.CANCELLED
          ? {
              cancelledAt: new Date(input.requestedFulfillmentAt),
              cancelledByUserId: user.id,
              cancellationReason: "Client absent",
            }
          : {}),
        ...by,
      },
    });
  await order({
    index: 1,
    status: CustomerOrderStatus.COMPLETED,
    customerId: bechir.id,
    requestedFulfillmentAt: "2001-03-10T08:30:00.000Z",
    totalTnd: "4.500",
    saleId: orderSale.id,
  });
  // Monday 12 March, 16:00 in Tunis.
  await order({
    index: 2,
    status: CustomerOrderStatus.CONFIRMED,
    customerId: amel.id,
    requestedFulfillmentAt: "2001-03-12T15:00:00.000Z",
    totalTnd: "30.000",
  });
  await order({
    index: 3,
    status: CustomerOrderStatus.CANCELLED,
    customerId: amel.id,
    requestedFulfillmentAt: "2001-03-12T15:10:00.000Z",
    totalTnd: "45.000",
  });

  const distributor = await prisma.distributor.create({
    data: {
      name: `Distributeur ${runId}`,
      normalizedName: `distributeur ${runId}`,
      ...by,
    },
  });
  const directSoldAt = new Date("2001-03-07T07:00:00.000Z");
  await prisma.distributorSale.create({
    data: {
      reference: `VD-AN-${runId}`,
      distributorId: distributor.id,
      status: SaleStatus.POSTED,
      paymentState: SalePaymentState.PAID,
      soldAt: directSoldAt,
      postedAt: directSoldAt,
      postedByUserId: user.id,
      totalTnd: "50.000",
      paidAmountTnd: "50.000",
      remainingDueTnd: "0.000",
      lines: {
        create: {
          productId: baguette.id,
          unitId: unit.id,
          quantity: "50",
          unitPriceTnd: "1.000",
          lineTotalTnd: "50.000",
          productNameSnapshot: baguette.name,
          unitNameSnapshot: unit.name,
        },
      },
    },
  });
  // Thirty croissants on consignment: twenty sold, ten returned.
  const dispatch = await prisma.distributorDispatch.create({
    data: {
      reference: `DV-AN-${runId}`,
      distributorId: distributor.id,
      status: DistributorDispatchStatus.CLOSED,
      dispatchedAt: new Date("2001-03-06T06:00:00.000Z"),
      postedByUserId: user.id,
      lines: {
        create: {
          productId: croissant.id,
          unitId: unit.id,
          dispatchedQuantity: "30",
          settledSoldQuantity: "20",
          returnedQuantity: "10",
          productNameSnapshot: croissant.name,
          unitNameSnapshot: unit.name,
        },
      },
    },
    include: { lines: true },
  });
  const settledAt = new Date("2001-03-08T16:00:00.000Z");
  await prisma.distributorSettlement.create({
    data: {
      reference: `RG-AN-${runId}`,
      distributorId: distributor.id,
      dispatchId: dispatch.id,
      settledAt,
      postedAt: settledAt,
      postedByUserId: user.id,
      totalTnd: "24.000",
      paidAmountTnd: "24.000",
      remainingDueTnd: "0.000",
      paymentState: SalePaymentState.PAID,
      lines: {
        create: {
          dispatchLineId: dispatch.lines[0]!.id,
          productId: croissant.id,
          unitId: unit.id,
          soldQuantity: "20",
          returnedQuantity: "10",
          unitPriceTnd: "1.200",
          lineTotalTnd: "24.000",
          productNameSnapshot: croissant.name,
          unitNameSnapshot: unit.name,
        },
      },
    },
  });

  const expenseCategory = await prisma.expenseCategory.create({
    data: {
      name: `Énergie ${runId}`,
      normalizedName: `energie ${runId}`,
      ...by,
    },
  });
  const expenseDate = new Date("2001-03-06T11:00:00.000Z");
  await prisma.expense.create({
    data: {
      reference: `DP-AN-${runId}-1`,
      categoryId: expenseCategory.id,
      status: ExpenseStatus.POSTED,
      expenseDate,
      amountTnd: "12.500",
      description: "Facture de gaz",
      responsibleUserId: user.id,
      postedAt: expenseDate,
      postedByUserId: user.id,
      ...by,
    },
  });
  await prisma.expense.create({
    data: {
      reference: `DP-AN-${runId}-2`,
      categoryId: expenseCategory.id,
      status: ExpenseStatus.CANCELLED,
      expenseDate,
      amountTnd: "77.000",
      description: "Saisie en double",
      responsibleUserId: user.id,
      postedAt: expenseDate,
      postedByUserId: user.id,
      cancelledAt: expenseDate,
      cancelledByUserId: user.id,
      cancellationReason: "Saisie en double",
      ...by,
    },
  });

  // Issue 021: purchases. The croissant is flagged for resale and bought
  // beside flour; flour is bought again later at a higher price.
  await prisma.product.update({
    where: { id: croissant.id },
    data: { isResale: true },
  });
  const supplier = await prisma.supplier.create({
    data: {
      name: `Fournisseur ${runId}`,
      normalizedName: `fournisseur ${runId}`,
      ...by,
    },
  });
  const flour = await prisma.rawMaterial.create({
    data: {
      name: `Farine ${runId}`,
      normalizedName: `farine ${runId}`,
      baseUnitId: unit.id,
      ...by,
    },
  });
  const purchase = async (input: {
    purchaseDate: string;
    cancelled?: boolean;
    paidTnd?: string;
    lines: Array<{
      item: { rawMaterialId: string } | { productId: string };
      name: string;
      quantity: string;
      unitPriceTnd: string;
    }>;
  }) => {
    const purchaseDate = new Date(input.purchaseDate);
    const total = input.lines
      .reduce(
        (sum, line) => sum + Number(line.quantity) * Number(line.unitPriceTnd),
        0,
      )
      .toFixed(3);
    const paid = input.paidTnd ?? "0.000";
    const created = await prisma.purchase.create({
      data: {
        supplierId: supplier.id,
        purchaseDate,
        status: input.cancelled
          ? PurchaseStatus.CANCELLED
          : PurchaseStatus.POSTED,
        paymentTerms:
          Number(paid) > 0
            ? PurchasePaymentTerms.PARTIAL
            : PurchasePaymentTerms.UNPAID,
        dueDate: new Date("2001-04-30T00:00:00.000Z"),
        totalTnd: total,
        paidAmountTnd: paid,
        remainingDueTnd: (Number(total) - Number(paid)).toFixed(3),
        postedAt: purchaseDate,
        postedByUserId: user.id,
        ...by,
        lines: {
          create: input.lines.map((line) => ({
            ...line.item,
            enteredUnitId: unit.id,
            baseUnitId: unit.id,
            enteredQuantity: line.quantity,
            conversionFactorToBase: "1",
            normalizedQuantity: line.quantity,
            unitPriceTnd: line.unitPriceTnd,
            lineTotalTnd: (
              Number(line.quantity) * Number(line.unitPriceTnd)
            ).toFixed(3),
            rawMaterialNameSnapshot: line.name,
            enteredUnitNameSnapshot: unit.name,
            baseUnitNameSnapshot: unit.name,
          })),
        },
      },
    });
    const entry = (entryType: SupplierLedgerEntryType, amountTnd: string) =>
      prisma.supplierLedgerEntry.create({
        data: {
          supplierId: supplier.id,
          purchaseId: created.id,
          entryType,
          amountTnd,
          occurredAt: purchaseDate,
          actorUserId: user.id,
        },
      });
    await entry(SupplierLedgerEntryType.PURCHASE_PAYABLE, total);
    if (Number(paid) > 0) {
      await entry(SupplierLedgerEntryType.PAYMENT, `-${paid}`);
    }
    if (input.cancelled) {
      await entry(SupplierLedgerEntryType.PURCHASE_REVERSAL, `-${total}`);
    }
    return created;
  };
  const flourLine = (quantity: string, unitPriceTnd: string) => ({
    item: { rawMaterialId: flour.id },
    name: flour.name,
    quantity,
    unitPriceTnd,
  });
  // The window before March (29 January to 28 February).
  await purchase({
    purchaseDate: "2001-02-20T00:00:00.000Z",
    lines: [flourLine("3", "1.000")],
  });
  await purchase({
    purchaseDate: "2001-03-06T00:00:00.000Z",
    paidTnd: "9.200",
    lines: [
      flourLine("10", "1.000"),
      {
        item: { productId: croissant.id },
        name: croissant.name,
        quantity: "24",
        unitPriceTnd: "0.800",
      },
    ],
  });
  await purchase({
    purchaseDate: "2001-03-20T00:00:00.000Z",
    lines: [flourLine("5", "1.200")],
  });
  await purchase({
    purchaseDate: "2001-03-21T00:00:00.000Z",
    cancelled: true,
    lines: [flourLine("100", "1.000")],
  });

  return {
    user,
    unit,
    category,
    baguette,
    croissant,
    tart,
    amel,
    bechir,
    terminal,
    session,
    distributor,
    expenseCategory,
    supplier,
    flour,
  };
}

async function cleanUp(prisma: PrismaClient, seeded: Seeded | undefined) {
  if (!seeded) {
    return;
  }

  const customerIds = [seeded.amel.id, seeded.bechir.id];
  const byDistributor = { distributorId: seeded.distributor.id };
  const bySupplier = { supplierId: seeded.supplier.id };

  // Ledger entries hold their purchase; lines follow it by cascade.
  await prisma.supplierLedgerEntry.deleteMany({ where: bySupplier });
  await prisma.purchase.deleteMany({ where: bySupplier });
  await prisma.supplier.delete({ where: { id: seeded.supplier.id } });
  await prisma.rawMaterial.delete({ where: { id: seeded.flour.id } });

  // Orders reference sales with ON DELETE RESTRICT, so orders go first;
  // lines follow their documents by cascade.
  await prisma.customerOrder.deleteMany({
    where: { customerId: { in: customerIds } },
  });
  await prisma.sale.deleteMany({ where: { sessionId: seeded.session.id } });
  await prisma.distributorSettlement.deleteMany({ where: byDistributor });
  await prisma.distributorDispatch.deleteMany({ where: byDistributor });
  await prisma.distributorSale.deleteMany({ where: byDistributor });
  await prisma.distributor.delete({ where: { id: seeded.distributor.id } });
  await prisma.expense.deleteMany({
    where: { categoryId: seeded.expenseCategory.id },
  });
  await prisma.expenseCategory.delete({
    where: { id: seeded.expenseCategory.id },
  });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.posSession.delete({ where: { id: seeded.session.id } });
  await prisma.posTerminal.delete({ where: { id: seeded.terminal.id } });
  await prisma.product.deleteMany({
    where: { categoryId: seeded.category.id },
  });
  await prisma.productCategory.delete({ where: { id: seeded.category.id } });
  await prisma.unit.delete({ where: { id: seeded.unit.id } });
  await prisma.user.delete({ where: { id: seeded.user.id } });
}
