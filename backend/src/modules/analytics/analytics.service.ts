import {
  ExpenseStatus,
  Prisma,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { sumOrZero } from "../../shared/ledger.js";
import { marginFigures } from "../../shared/marginFigures.js";
import { bucketFormat } from "./analytics.sql.js";
import { distributorsAnalysis } from "./distributors.analysis.js";
import {
  daysOf,
  describePeriod,
  weekdayOf,
  type AnalyticsPeriod,
} from "./period.js";
import { purchasesAnalysis } from "./purchases.analysis.js";

/// DEC-V2-006: analyses over the history the application already records.
/// Read-only, posted documents only, every figure aggregated by the
/// database with days and hours read in Africa/Tunis. A block that belongs
/// to another permission is `null` unless the caller also holds it, like
/// the home summary.
export interface AnalyticsParams {
  period: AnalyticsPeriod;
  permissions: ReadonlySet<string>;
}

/// A customer who has not bought for this long is worth a call.
export const inactiveAfterDays = 60;
const inactiveSample = 20;
const topCustomers = 10;
const unsoldSample = 20;
const dayMs = 24 * 60 * 60 * 1000;
const zero = new Prisma.Decimal(0);

interface RevenueBucket {
  counter: Prisma.Decimal;
  orders: Prisma.Decimal;
  distributors: Prisma.Decimal;
  salesCount: number;
  remainingDue: Prisma.Decimal;
}

interface FrequencyRow {
  weekday: number;
  hour: number;
  count: number;
  total: string | null;
}

export class AnalyticsService {
  public constructor(private readonly prisma: PrismaClient) {}

  /// Revenue by channel, till sales and average basket against the window
  /// just before, expenses, approximate margin and the trend per bucket.
  public async getOverview(params: AnalyticsParams) {
    const { period } = params;
    const can = (key: string) => params.permissions.has(key);
    const [current, previous, cancelledCount, expenses, margin] =
      await Promise.all([
        this.revenueBuckets(period.start, period.end, period.granularity),
        this.revenueBuckets(period.previous.start, period.previous.end, "day"),
        this.prisma.sale.count({
          where: {
            status: SaleStatus.CANCELLED,
            soldAt: { gte: period.start, lte: period.end },
          },
        }),
        can("expenses.view") ? this.expensesBlock(period) : null,
        can("margin.view")
          ? Promise.all([
              marginFigures(this.prisma, period.start, period.end),
              marginFigures(
                this.prisma,
                period.previous.start,
                period.previous.end,
              ),
            ]).then(([now, before]) => ({ current: now, previous: before }))
          : null,
      ]);
    const totals = sumBuckets([...current.values()]);
    const previousTotals = sumBuckets([...previous.values()]);
    const previousDays = daysOf(period.previous.from, period.previous.to);
    const trend = period.buckets.map((bucket, index) => {
      const row = current.get(bucket);
      // The comparison line is the same day of the previous window; a
      // monthly trend has no window of equal months to align with.
      const before =
        period.granularity === "day"
          ? previous.get(previousDays[index] as string)
          : undefined;

      return {
        bucket,
        revenueTnd: revenueOf(row).toFixed(3),
        salesCount: row?.salesCount ?? 0,
        expensesTnd: expenses
          ? (expenses.byBucket.get(bucket) ?? zero).toFixed(3)
          : null,
        previousRevenueTnd:
          period.granularity === "day" ? revenueOf(before).toFixed(3) : null,
      };
    });
    const best = trend.reduce<(typeof trend)[number] | null>(
      (winner, row) =>
        Number(row.revenueTnd) > Number(winner?.revenueTnd ?? 0) ? row : winner,
      null,
    );

    return {
      period: describePeriod(period),
      generatedAt: new Date(),
      revenue: {
        totalTnd: revenueOf(totals).toFixed(3),
        previousTotalTnd: revenueOf(previousTotals).toFixed(3),
        counterTnd: totals.counter.toFixed(3),
        ordersTnd: totals.orders.toFixed(3),
        distributorsTnd: totals.distributors.toFixed(3),
      },
      sales: {
        count: totals.salesCount,
        previousCount: previousTotals.salesCount,
        averageBasketTnd: averageBasket(totals),
        previousAverageBasketTnd: averageBasket(previousTotals),
        remainingDueTnd: totals.remainingDue.toFixed(3),
        cancelledCount,
      },
      expenses: expenses
        ? {
            totalTnd: expenses.totalTnd,
            previousTotalTnd: expenses.previousTotalTnd,
            byCategory: expenses.byCategory,
          }
        : null,
      margin,
      trend,
      bestBucket: best
        ? { bucket: best.bucket, revenueTnd: best.revenueTnd }
        : null,
    };
  }

  /// When the bakery sells and when orders are due: weekday by hour.
  public async getFrequency(params: AnalyticsParams) {
    const { period } = params;
    const [sales, orders] = await Promise.all([
      this.prisma.$queryRaw<FrequencyRow[]>`
        SELECT
          EXTRACT(ISODOW FROM t."local")::int AS weekday,
          EXTRACT(HOUR FROM t."local")::int AS hour,
          COUNT(*)::int AS count,
          SUM(t."total")::text AS total
        FROM (
          SELECT
            (s."sold_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis' AS "local",
            s."total_tnd" AS "total"
          FROM "sales" s
          WHERE s."status" = 'POSTED'
            AND s."sold_at" >= ${period.start}
            AND s."sold_at" <= ${period.end}
        ) t
        GROUP BY 1, 2
      `,
      params.permissions.has("orders.view")
        ? this.prisma.$queryRaw<FrequencyRow[]>`
            SELECT
              EXTRACT(ISODOW FROM t."local")::int AS weekday,
              EXTRACT(HOUR FROM t."local")::int AS hour,
              COUNT(*)::int AS count,
              SUM(t."total")::text AS total
            FROM (
              SELECT
                (o."requested_fulfillment_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis' AS "local",
                o."total_tnd" AS "total"
              FROM "customer_orders" o
              WHERE o."status" <> 'CANCELLED'
                AND o."requested_fulfillment_at" >= ${period.start}
                AND o."requested_fulfillment_at" <= ${period.end}
            ) t
            GROUP BY 1, 2
          `
        : null,
    ]);

    return {
      period: describePeriod(period),
      sales: frequencyBlock(sales, period),
      orders: orders ? frequencyBlock(orders, period) : null,
    };
  }

  /// What sells over every channel, how often, and what did not sell. The
  /// approximate margin reads costed till lines only (DEC-V2-005).
  public async getProducts(params: AnalyticsParams) {
    const { period } = params;
    const withMargin = params.permissions.has("margin.view");
    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        name: string;
        category_id: string;
        category_name: string;
        unit_name: string;
        quantity: string;
        documents: number;
        revenue: string;
        costed_revenue: string | null;
        cost: string | null;
        last_sold_at: Date;
      }>
    >`
      SELECT
        p."id" AS product_id,
        p."name" AS name,
        c."id" AS category_id,
        c."name" AS category_name,
        u."name" AS unit_name,
        SUM(l."quantity")::text AS quantity,
        COUNT(DISTINCT l."document_id")::int AS documents,
        SUM(l."total")::text AS revenue,
        SUM(l."costed_total")::text AS costed_revenue,
        SUM(l."cost")::text AS cost,
        MAX(l."at") AS last_sold_at
      FROM (
        SELECT
          sl."product_id" AS "product_id",
          sl."quantity" AS "quantity",
          sl."line_total_tnd" AS "total",
          CASE WHEN sl."unit_cost_tnd" IS NOT NULL THEN sl."line_total_tnd" END AS "costed_total",
          sl."quantity" * sl."unit_cost_tnd" AS "cost",
          s."id" AS "document_id",
          s."sold_at" AS "at"
        FROM "sale_lines" sl
        JOIN "sales" s ON s."id" = sl."sale_id"
        WHERE s."status" = 'POSTED'
          AND s."sold_at" >= ${period.start}
          AND s."sold_at" <= ${period.end}
        UNION ALL
        SELECT
          dl."product_id",
          dl."quantity",
          dl."line_total_tnd",
          NULL::numeric,
          NULL::numeric,
          d."id",
          d."sold_at"
        FROM "distributor_sale_lines" dl
        JOIN "distributor_sales" d ON d."id" = dl."sale_id"
        WHERE d."status" = 'POSTED'
          AND d."sold_at" >= ${period.start}
          AND d."sold_at" <= ${period.end}
        UNION ALL
        SELECT
          tl."product_id",
          tl."sold_quantity",
          tl."line_total_tnd",
          NULL::numeric,
          NULL::numeric,
          t."id",
          t."settled_at"
        FROM "distributor_settlement_lines" tl
        JOIN "distributor_settlements" t ON t."id" = tl."settlement_id"
        WHERE tl."sold_quantity" > 0
          AND t."settled_at" >= ${period.start}
          AND t."settled_at" <= ${period.end}
      ) l
      JOIN "products" p ON p."id" = l."product_id"
      JOIN "product_categories" c ON c."id" = p."category_id"
      JOIN "units" u ON u."id" = p."base_unit_id"
      GROUP BY p."id", p."name", c."id", c."name", u."name"
      ORDER BY SUM(l."total") DESC, p."name" ASC
    `;
    const soldIds = rows.map((row) => row.product_id);
    const unsoldWhere = { isActive: true, id: { notIn: soldIds } };
    const [unsoldCount, unsold] = await Promise.all([
      this.prisma.product.count({ where: unsoldWhere }),
      this.prisma.product.findMany({
        where: unsoldWhere,
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: unsoldSample,
      }),
    ]);
    const categories = new Map<
      string,
      { categoryId: string; name: string; revenue: Prisma.Decimal }
    >();
    let revenue = zero;

    for (const row of rows) {
      const amount = new Prisma.Decimal(row.revenue);
      const category = categories.get(row.category_id) ?? {
        categoryId: row.category_id,
        name: row.category_name,
        revenue: zero,
      };
      category.revenue = category.revenue.plus(amount);
      categories.set(row.category_id, category);
      revenue = revenue.plus(amount);
    }

    return {
      period: describePeriod(period),
      totals: { revenueTnd: revenue.toFixed(3), productsCount: rows.length },
      items: rows.map((row) => {
        const costedRevenue = new Prisma.Decimal(row.costed_revenue ?? 0);
        const cost = new Prisma.Decimal(row.cost ?? 0).toDecimalPlaces(3);

        return {
          productId: row.product_id,
          name: row.name,
          categoryId: row.category_id,
          categoryName: row.category_name,
          unitName: row.unit_name,
          quantity: new Prisma.Decimal(row.quantity).toFixed(6),
          documentsCount: row.documents,
          revenueTnd: new Prisma.Decimal(row.revenue).toFixed(3),
          lastSoldAt: row.last_sold_at,
          // `null` without `margin.view`, and for a product never costed.
          costedRevenueTnd: withMargin ? costedRevenue.toFixed(3) : null,
          marginTnd:
            withMargin && row.costed_revenue !== null
              ? costedRevenue.minus(cost).toFixed(3)
              : null,
        };
      }),
      categories: [...categories.values()]
        .sort((left, right) => right.revenue.comparedTo(left.revenue))
        .map((category) => ({
          categoryId: category.categoryId,
          name: category.name,
          revenueTnd: category.revenue.toFixed(3),
        })),
      unsold: {
        count: unsoldCount,
        items: unsold.map((product) => ({
          productId: product.id,
          name: product.name,
        })),
      },
    };
  }

  /// Who buys: identified against anonymous sales, new and returning
  /// customers, the best ones of the window and the ones to win back.
  public async getCustomers(params: AnalyticsParams, now = new Date()) {
    const { period } = params;
    const inWindow = {
      status: SaleStatus.POSTED,
      soldAt: { gte: period.start, lte: period.end },
    };
    const cutoff = new Date(now.getTime() - inactiveAfterDays * dayMs);
    const [identified, anonymous, segments, newcomers, top, inactive] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { ...inWindow, customerId: { not: null } },
          _count: { _all: true },
          _sum: { totalTnd: true },
        }),
        this.prisma.sale.aggregate({
          where: { ...inWindow, customerId: null },
          _count: { _all: true },
          _sum: { totalTnd: true },
        }),
        this.prisma.$queryRaw<
          Array<{ active_count: number; repeat_count: number }>
        >`
          SELECT
            COUNT(*)::int AS active_count,
            (COUNT(*) FILTER (WHERE t."sales" >= 2))::int AS repeat_count
          FROM (
            SELECT s."customer_id", COUNT(*) AS "sales"
            FROM "sales" s
            WHERE s."status" = 'POSTED'
              AND s."customer_id" IS NOT NULL
              AND s."sold_at" >= ${period.start}
              AND s."sold_at" <= ${period.end}
            GROUP BY s."customer_id"
          ) t
        `,
        this.prisma.$queryRaw<Array<{ new_count: number }>>`
          SELECT COUNT(*)::int AS new_count
          FROM (
            SELECT s."customer_id", MIN(s."sold_at") AS "first_at"
            FROM "sales" s
            WHERE s."status" = 'POSTED' AND s."customer_id" IS NOT NULL
            GROUP BY s."customer_id"
          ) t
          WHERE t."first_at" >= ${period.start} AND t."first_at" <= ${period.end}
        `,
        this.prisma.sale.groupBy({
          by: ["customerId"],
          where: { ...inWindow, customerId: { not: null } },
          _count: { _all: true },
          _sum: { totalTnd: true },
          _max: { soldAt: true },
          orderBy: [{ _sum: { totalTnd: "desc" } }, { customerId: "asc" }],
          take: topCustomers,
        }),
        this.prisma.$queryRaw<
          Array<{
            customer_id: string;
            name: string;
            last_at: Date;
            sales_count: number;
            total: string;
            full_count: number;
          }>
        >`
          SELECT
            c."id" AS customer_id,
            c."name" AS name,
            t."last_at" AS last_at,
            t."sales"::int AS sales_count,
            t."total"::text AS total,
            (COUNT(*) OVER ())::int AS full_count
          FROM (
            SELECT
              s."customer_id",
              MAX(s."sold_at") AS "last_at",
              COUNT(*) AS "sales",
              SUM(s."total_tnd") AS "total"
            FROM "sales" s
            WHERE s."status" = 'POSTED' AND s."customer_id" IS NOT NULL
            GROUP BY s."customer_id"
          ) t
          JOIN "customers" c ON c."id" = t."customer_id"
          WHERE c."is_active" = TRUE AND t."last_at" < ${cutoff}
          ORDER BY t."total" DESC, c."name" ASC
          LIMIT ${inactiveSample}
        `,
      ]);
    const names = await this.prisma.customer.findMany({
      where: { id: { in: top.map((row) => row.customerId as string) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(
      names.map((customer) => [customer.id, customer.name]),
    );

    return {
      period: describePeriod(period),
      summary: {
        identifiedSalesCount: identified._count._all,
        identifiedRevenueTnd: sumOrZero(identified._sum.totalTnd).toFixed(3),
        anonymousSalesCount: anonymous._count._all,
        anonymousRevenueTnd: sumOrZero(anonymous._sum.totalTnd).toFixed(3),
        activeCount: segments[0]?.active_count ?? 0,
        returningCount: segments[0]?.repeat_count ?? 0,
        newCount: newcomers[0]?.new_count ?? 0,
      },
      top: top.map((row) => {
        const total = sumOrZero(row._sum.totalTnd);

        return {
          customerId: row.customerId as string,
          name: nameOf.get(row.customerId as string) ?? "",
          salesCount: row._count._all,
          revenueTnd: total.toFixed(3),
          averageBasketTnd: total.dividedBy(row._count._all).toFixed(3),
          lastPurchaseAt: row._max.soldAt,
        };
      }),
      inactive: {
        thresholdDays: inactiveAfterDays,
        count: inactive[0]?.full_count ?? 0,
        items: inactive.map((row) => ({
          customerId: row.customer_id,
          name: row.name,
          lastPurchaseAt: row.last_at,
          daysSince: Math.floor(
            (now.getTime() - row.last_at.getTime()) / dayMs,
          ),
          salesCount: row.sales_count,
          revenueTnd: new Prisma.Decimal(row.total).toFixed(3),
        })),
      },
    };
  }

  /// Issue 021: what was bought, in raw materials and in products to
  /// resell, from whom and at what price.
  public getPurchases(params: AnalyticsParams) {
    return purchasesAnalysis(this.prisma, params);
  }

  /// Issue 021: the distributor channel, who sells, what, what comes back.
  public getDistributors(params: AnalyticsParams) {
    return distributorsAnalysis(this.prisma, params);
  }

  /// Revenue per bucket and per channel: till sales split by whether an
  /// order produced them, plus direct distributor sales and settlements.
  private async revenueBuckets(
    start: Date,
    end: Date,
    granularity: AnalyticsPeriod["granularity"],
  ): Promise<Map<string, RevenueBucket>> {
    const format = bucketFormat[granularity];
    const [sales, distributors] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          bucket: string;
          from_order: boolean;
          count: number;
          total: string;
          due: string;
        }>
      >`
        SELECT
          to_char((s."sold_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${format}) AS bucket,
          (o."id" IS NOT NULL) AS from_order,
          COUNT(*)::int AS count,
          SUM(s."total_tnd")::text AS total,
          SUM(s."remaining_due_tnd")::text AS due
        FROM "sales" s
        LEFT JOIN "customer_orders" o ON o."sale_id" = s."id"
        WHERE s."status" = 'POSTED'
          AND s."sold_at" >= ${start}
          AND s."sold_at" <= ${end}
        GROUP BY 1, 2
      `,
      this.prisma.$queryRaw<Array<{ bucket: string; total: string }>>`
        SELECT x."bucket" AS bucket, SUM(x."total")::text AS total
        FROM (
          SELECT
            to_char((d."sold_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${format}) AS "bucket",
            d."total_tnd" AS "total"
          FROM "distributor_sales" d
          WHERE d."status" = 'POSTED'
            AND d."sold_at" >= ${start}
            AND d."sold_at" <= ${end}
          UNION ALL
          SELECT
            to_char((t."settled_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${format}),
            t."total_tnd"
          FROM "distributor_settlements" t
          WHERE t."settled_at" >= ${start}
            AND t."settled_at" <= ${end}
        ) x
        GROUP BY 1
      `,
    ]);
    const buckets = new Map<string, RevenueBucket>();
    const bucketOf = (key: string) => {
      const existing = buckets.get(key);
      if (existing) {
        return existing;
      }

      const created = emptyBucket();
      buckets.set(key, created);
      return created;
    };

    for (const row of sales) {
      const bucket = bucketOf(row.bucket);
      const total = new Prisma.Decimal(row.total);

      if (row.from_order) {
        bucket.orders = bucket.orders.plus(total);
      } else {
        bucket.counter = bucket.counter.plus(total);
      }
      bucket.salesCount += row.count;
      bucket.remainingDue = bucket.remainingDue.plus(row.due);
    }

    for (const row of distributors) {
      const bucket = bucketOf(row.bucket);
      bucket.distributors = bucket.distributors.plus(row.total);
    }

    return buckets;
  }

  private async expensesBlock(period: AnalyticsPeriod) {
    const posted = (from: Date, to: Date) => ({
      status: ExpenseStatus.POSTED,
      expenseDate: { gte: from, lte: to },
    });
    const [byBucket, byCategory, previous] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: string; total: string }>>`
        SELECT
          to_char((e."expense_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${bucketFormat[period.granularity]}) AS bucket,
          SUM(e."amount_tnd")::text AS total
        FROM "expenses" e
        WHERE e."status" = 'POSTED'
          AND e."expense_date" >= ${period.start}
          AND e."expense_date" <= ${period.end}
        GROUP BY 1
      `,
      this.prisma.expense.groupBy({
        by: ["categoryId"],
        where: posted(period.start, period.end),
        _sum: { amountTnd: true },
      }),
      this.prisma.expense.aggregate({
        where: posted(period.previous.start, period.previous.end),
        _sum: { amountTnd: true },
      }),
    ]);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: byCategory.map((row) => row.categoryId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const ranked = byCategory
      .map((row) => ({
        categoryId: row.categoryId,
        name: nameOf.get(row.categoryId) ?? "",
        total: sumOrZero(row._sum.amountTnd),
      }))
      .sort((left, right) => right.total.comparedTo(left.total));

    return {
      totalTnd: ranked
        .reduce((sum, row) => sum.plus(row.total), zero)
        .toFixed(3),
      previousTotalTnd: sumOrZero(previous._sum.amountTnd).toFixed(3),
      byCategory: ranked.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        totalTnd: row.total.toFixed(3),
      })),
      byBucket: new Map(
        byBucket.map((row) => [row.bucket, new Prisma.Decimal(row.total)]),
      ),
    };
  }
}

function emptyBucket(): RevenueBucket {
  return {
    counter: zero,
    orders: zero,
    distributors: zero,
    salesCount: 0,
    remainingDue: zero,
  };
}

function sumBuckets(buckets: RevenueBucket[]): RevenueBucket {
  return buckets.reduce(
    (sum, bucket) => ({
      counter: sum.counter.plus(bucket.counter),
      orders: sum.orders.plus(bucket.orders),
      distributors: sum.distributors.plus(bucket.distributors),
      salesCount: sum.salesCount + bucket.salesCount,
      remainingDue: sum.remainingDue.plus(bucket.remainingDue),
    }),
    emptyBucket(),
  );
}

function revenueOf(bucket: RevenueBucket | undefined): Prisma.Decimal {
  return bucket
    ? bucket.counter.plus(bucket.orders).plus(bucket.distributors)
    : zero;
}

/// The basket is a till figure: distributor documents are not baskets.
function averageBasket(bucket: RevenueBucket): string | null {
  return bucket.salesCount === 0
    ? null
    : bucket.counter
        .plus(bucket.orders)
        .dividedBy(bucket.salesCount)
        .toFixed(3);
}

/// Shapes the weekday-by-hour rows: the non-empty cells, the seven weekdays
/// with the average per occurrence of that weekday in the window (a month
/// holds five Mondays or four), the twenty-four hours and the busiest slot.
function frequencyBlock(rows: FrequencyRow[], period: AnalyticsPeriod) {
  const occurrences = new Map<number, number>();
  for (const day of daysOf(period.from, period.to)) {
    const weekday = weekdayOf(day);
    occurrences.set(weekday, (occurrences.get(weekday) ?? 0) + 1);
  }

  const cells = rows
    .map((row) => ({
      weekday: row.weekday,
      hour: row.hour,
      count: row.count,
      total: new Prisma.Decimal(row.total ?? 0),
    }))
    .sort(
      (left, right) => left.weekday - right.weekday || left.hour - right.hour,
    );
  const sumWhere = (match: (cell: (typeof cells)[number]) => boolean) =>
    cells.filter(match).reduce(
      (sum, cell) => ({
        count: sum.count + cell.count,
        total: sum.total.plus(cell.total),
      }),
      { count: 0, total: zero },
    );
  const all = sumWhere(() => true);
  const peak = cells.reduce<(typeof cells)[number] | null>(
    (winner, cell) =>
      !winner ||
      cell.count > winner.count ||
      (cell.count === winner.count && cell.total.greaterThan(winner.total))
        ? cell
        : winner,
    null,
  );
  const cellOut = (cell: (typeof cells)[number]) => ({
    weekday: cell.weekday,
    hour: cell.hour,
    count: cell.count,
    totalTnd: cell.total.toFixed(3),
  });

  return {
    count: all.count,
    totalTnd: all.total.toFixed(3),
    cells: cells.map(cellOut),
    weekdays: Array.from({ length: 7 }, (_, index) => {
      const weekday = index + 1;
      const days = occurrences.get(weekday) ?? 0;
      const sum = sumWhere((cell) => cell.weekday === weekday);

      return {
        weekday,
        days,
        count: sum.count,
        totalTnd: sum.total.toFixed(3),
        averageCount: days === 0 ? 0 : Math.round((sum.count / days) * 10) / 10,
        averageTnd: days === 0 ? "0.000" : sum.total.dividedBy(days).toFixed(3),
      };
    }),
    hours: Array.from({ length: 24 }, (_, hour) => {
      const sum = sumWhere((cell) => cell.hour === hour);

      return { hour, count: sum.count, totalTnd: sum.total.toFixed(3) };
    }),
    peak: peak ? cellOut(peak) : null,
  };
}
