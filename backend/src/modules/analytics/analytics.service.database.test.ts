import {
  CustomerOrderStatus,
  DistributorDispatchStatus,
  ExpenseStatus,
  PosSessionStatus,
  PrismaClient,
  SalePaymentState,
  SaleStatus,
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
  };
}

async function cleanUp(prisma: PrismaClient, seeded: Seeded | undefined) {
  if (!seeded) {
    return;
  }

  const customerIds = [seeded.amel.id, seeded.bechir.id];
  const byDistributor = { distributorId: seeded.distributor.id };

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
