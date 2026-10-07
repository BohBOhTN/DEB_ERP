import { Prisma, type PrismaClient } from "@prisma/client";
import { sumOrZero } from "../../shared/ledger.js";
import { bucketFormat, percentOf } from "./analytics.sql.js";
import { describePeriod, type AnalyticsPeriod } from "./period.js";

/// Issue 021, DEC-V2-011: the distributor channel. Its revenue is the
/// direct sales posted plus the consignment settlements, the way the
/// overview counts it; a settlement also says what came back, so the
/// return rate is read from its lines: returned over everything settled
/// (sold, returned and unaccounted).
const zero = new Prisma.Decimal(0);

interface ChannelRow {
  bucket: string;
  consignment: boolean;
  total: string;
  documents: number;
}

export async function distributorsAnalysis(
  prisma: PrismaClient,
  params: { period: AnalyticsPeriod; permissions: ReadonlySet<string> },
) {
  const { period } = params;
  const withBalances = params.permissions.has("distribution.balances.view");
  const withMargin = params.permissions.has("margin.view");
  const channel = (
    start: Date,
    end: Date,
    granularity: AnalyticsPeriod["granularity"],
  ) => prisma.$queryRaw<ChannelRow[]>`
    SELECT
      x."bucket" AS bucket,
      x."consignment" AS consignment,
      SUM(x."total")::text AS total,
      COUNT(*)::int AS documents
    FROM (
      SELECT
        to_char((d."sold_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${bucketFormat[granularity]}) AS "bucket",
        false AS "consignment",
        d."total_tnd" AS "total"
      FROM "distributor_sales" d
      WHERE d."status" = 'POSTED'
        AND d."sold_at" >= ${start}
        AND d."sold_at" <= ${end}
      UNION ALL
      SELECT
        to_char((t."settled_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${bucketFormat[granularity]}),
        true,
        t."total_tnd"
      FROM "distributor_settlements" t
      WHERE t."settled_at" >= ${start}
        AND t."settled_at" <= ${end}
    ) x
    GROUP BY x."bucket", x."consignment"
  `;
  const [current, previous, distributors, products, balance] =
    await Promise.all([
      channel(period.start, period.end, period.granularity),
      channel(period.previous.start, period.previous.end, "month"),
      prisma.$queryRaw<
        Array<{
          distributor_id: string;
          name: string;
          direct: string;
          direct_documents: number;
          consignment: string;
          consignment_documents: number;
          sold_quantity: string;
          returned_quantity: string;
          unaccounted_quantity: string;
          last_at: Date | null;
        }>
      >`
        SELECT
          di."id" AS distributor_id,
          di."name" AS name,
          COALESCE(s."direct", 0)::text AS direct,
          COALESCE(s."documents", 0)::int AS direct_documents,
          COALESCE(t."consignment", 0)::text AS consignment,
          COALESCE(t."documents", 0)::int AS consignment_documents,
          COALESCE(q."sold", 0)::text AS sold_quantity,
          COALESCE(q."returned", 0)::text AS returned_quantity,
          COALESCE(q."unaccounted", 0)::text AS unaccounted_quantity,
          GREATEST(s."last_at", t."last_at") AS last_at
        FROM "distributors" di
        LEFT JOIN (
          SELECT d."distributor_id" AS "distributor_id", SUM(d."total_tnd") AS "direct", COUNT(*) AS "documents", MAX(d."sold_at") AS "last_at"
          FROM "distributor_sales" d
          WHERE d."status" = 'POSTED'
            AND d."sold_at" >= ${period.start}
            AND d."sold_at" <= ${period.end}
          GROUP BY d."distributor_id"
        ) s ON s."distributor_id" = di."id"
        LEFT JOIN (
          SELECT st."distributor_id" AS "distributor_id", SUM(st."total_tnd") AS "consignment", COUNT(*) AS "documents", MAX(st."settled_at") AS "last_at"
          FROM "distributor_settlements" st
          WHERE st."settled_at" >= ${period.start}
            AND st."settled_at" <= ${period.end}
          GROUP BY st."distributor_id"
        ) t ON t."distributor_id" = di."id"
        LEFT JOIN (
          SELECT sq."distributor_id" AS "distributor_id", SUM(ql."sold_quantity") AS "sold", SUM(ql."returned_quantity") AS "returned", SUM(ql."unaccounted_quantity") AS "unaccounted"
          FROM "distributor_settlement_lines" ql
          JOIN "distributor_settlements" sq ON sq."id" = ql."settlement_id"
          WHERE sq."settled_at" >= ${period.start}
            AND sq."settled_at" <= ${period.end}
          GROUP BY sq."distributor_id"
        ) q ON q."distributor_id" = di."id"
        WHERE s."distributor_id" IS NOT NULL OR t."distributor_id" IS NOT NULL
        ORDER BY COALESCE(s."direct", 0) + COALESCE(t."consignment", 0) DESC, di."name" ASC
      `,
      prisma.$queryRaw<
        Array<{
          product_id: string;
          name: string;
          unit_name: string;
          quantity: string;
          revenue: string;
          settled_sold: string;
          returned: string;
          unaccounted: string;
          costed_revenue: string | null;
          cost: string | null;
        }>
      >`
        SELECT
          p."id" AS product_id,
          p."name" AS name,
          u."name" AS unit_name,
          SUM(x."quantity")::text AS quantity,
          SUM(x."total")::text AS revenue,
          SUM(x."settled_sold")::text AS settled_sold,
          SUM(x."returned")::text AS returned,
          SUM(x."unaccounted")::text AS unaccounted,
          SUM(x."costed_total")::text AS costed_revenue,
          SUM(x."cost")::text AS cost
        FROM (
          SELECT
            dl."product_id" AS "product_id",
            dl."quantity" AS "quantity",
            dl."line_total_tnd" AS "total",
            0::numeric AS "settled_sold",
            0::numeric AS "returned",
            0::numeric AS "unaccounted",
            CASE WHEN dl."unit_cost_tnd" IS NOT NULL THEN dl."line_total_tnd" END AS "costed_total",
            dl."quantity" * dl."unit_cost_tnd" AS "cost"
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
            tl."sold_quantity",
            tl."returned_quantity",
            tl."unaccounted_quantity",
            CASE WHEN tl."unit_cost_tnd" IS NOT NULL THEN tl."line_total_tnd" END,
            tl."sold_quantity" * tl."unit_cost_tnd"
          FROM "distributor_settlement_lines" tl
          JOIN "distributor_settlements" t ON t."id" = tl."settlement_id"
          WHERE t."settled_at" >= ${period.start}
            AND t."settled_at" <= ${period.end}
        ) x
        JOIN "products" p ON p."id" = x."product_id"
        JOIN "units" u ON u."id" = p."base_unit_id"
        GROUP BY p."id", p."name", u."name"
        ORDER BY SUM(x."total") DESC, p."name" ASC
      `,
      withBalances
        ? prisma.distributorLedgerEntry.groupBy({
            by: ["distributorId"],
            _sum: { amountTnd: true },
          })
        : null,
    ]);

  const byBucket = new Map<
    string,
    { direct: Prisma.Decimal; consignment: Prisma.Decimal }
  >();
  let documentsCount = 0;
  for (const row of current) {
    const bucket = byBucket.get(row.bucket) ?? {
      direct: zero,
      consignment: zero,
    };
    if (row.consignment) {
      bucket.consignment = bucket.consignment.plus(row.total);
    } else {
      bucket.direct = bucket.direct.plus(row.total);
    }
    byBucket.set(row.bucket, bucket);
    documentsCount += row.documents;
  }
  const directTnd = [...byBucket.values()].reduce(
    (sum, bucket) => sum.plus(bucket.direct),
    zero,
  );
  const consignmentTnd = [...byBucket.values()].reduce(
    (sum, bucket) => sum.plus(bucket.consignment),
    zero,
  );
  const previousRevenue = previous.reduce(
    (sum, row) => sum.plus(row.total),
    zero,
  );
  const balanceOf = new Map(
    (balance ?? []).map((row) => [
      row.distributorId,
      sumOrZero(row._sum.amountTnd),
    ]),
  );
  const returnRate = (sold: string, returned: string, unaccounted: string) =>
    percentOf(
      new Prisma.Decimal(returned),
      new Prisma.Decimal(sold).plus(returned).plus(unaccounted),
    );
  const settled = distributors.reduce(
    (sum, row) => ({
      sold: sum.sold.plus(row.sold_quantity),
      returned: sum.returned.plus(row.returned_quantity),
      unaccounted: sum.unaccounted.plus(row.unaccounted_quantity),
    }),
    { sold: zero, returned: zero, unaccounted: zero },
  );

  return {
    period: describePeriod(period),
    generatedAt: new Date(),
    totals: {
      revenueTnd: directTnd.plus(consignmentTnd).toFixed(3),
      previousRevenueTnd: previousRevenue.toFixed(3),
      directTnd: directTnd.toFixed(3),
      consignmentTnd: consignmentTnd.toFixed(3),
      documentsCount,
      previousDocumentsCount: previous.reduce(
        (sum, row) => sum + row.documents,
        0,
      ),
      activeCount: distributors.length,
      /// Returned over everything settled from consignment in the window;
      /// `null` when nothing was settled.
      returnRatePercent: returnRate(
        settled.sold.toString(),
        settled.returned.toString(),
        settled.unaccounted.toString(),
      ),
      /// What every distributor owes today; `null` without
      /// `distribution.balances.view`.
      balanceTnd: balance
        ? [...balanceOf.values()]
            .reduce((sum, value) => sum.plus(value), zero)
            .toFixed(3)
        : null,
    },
    trend: period.buckets.map((bucket) => {
      const row = byBucket.get(bucket);
      return {
        bucket,
        directTnd: (row?.direct ?? zero).toFixed(3),
        consignmentTnd: (row?.consignment ?? zero).toFixed(3),
      };
    }),
    distributors: distributors.map((row) => {
      const direct = new Prisma.Decimal(row.direct);
      const consignment = new Prisma.Decimal(row.consignment);
      return {
        distributorId: row.distributor_id,
        name: row.name,
        revenueTnd: direct.plus(consignment).toFixed(3),
        directTnd: direct.toFixed(3),
        consignmentTnd: consignment.toFixed(3),
        documentsCount: row.direct_documents + row.consignment_documents,
        soldQuantity: new Prisma.Decimal(row.sold_quantity).toFixed(3),
        returnedQuantity: new Prisma.Decimal(row.returned_quantity).toFixed(3),
        returnRatePercent: returnRate(
          row.sold_quantity,
          row.returned_quantity,
          row.unaccounted_quantity,
        ),
        lastActivityAt: row.last_at,
        balanceTnd: balance
          ? (balanceOf.get(row.distributor_id) ?? zero).toFixed(3)
          : null,
      };
    }),
    products: products.map((row) => {
      const costed = row.costed_revenue !== null && row.cost !== null;
      return {
        productId: row.product_id,
        name: row.name,
        unitName: row.unit_name,
        quantity: new Prisma.Decimal(row.quantity).toFixed(3),
        revenueTnd: new Prisma.Decimal(row.revenue).toFixed(3),
        returnedQuantity: new Prisma.Decimal(row.returned).toFixed(3),
        returnRatePercent: returnRate(
          row.settled_sold,
          row.returned,
          row.unaccounted,
        ),
        /// Approximate margin on the lines that carried a cost
        /// (`DEC-V2-005`); `null` without `margin.view` or without a cost.
        marginTnd:
          withMargin && costed
            ? new Prisma.Decimal(row.costed_revenue as string)
                .minus(row.cost as string)
                .toFixed(3)
            : null,
      };
    }),
  };
}
