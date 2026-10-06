import { Prisma, PurchaseStatus, type PrismaClient } from "@prisma/client";
import { purchaseTotalsByKind } from "../../shared/purchaseFigures.js";
import { bucketFormat, percentOf } from "./analytics.sql.js";
import { describePeriod, type AnalyticsPeriod } from "./period.js";

/// Issue 021, DEC-V2-011: what the bakery bought over the window, in raw
/// materials and in products to resell, from whom and at what price.
/// Posted purchases only, counted on their purchase date for their full
/// amount; every figure is a SQL aggregate.
const zero = new Prisma.Decimal(0);

export async function purchasesAnalysis(
  prisma: PrismaClient,
  params: { period: AnalyticsPeriod; permissions: ReadonlySet<string> },
) {
  const { period } = params;
  const withMargin = params.permissions.has("margin.view");
  const posted = (from: Date, to: Date) => ({
    status: PurchaseStatus.POSTED,
    purchaseDate: { gte: from, lte: to },
  });
  const [
    buckets,
    previous,
    purchasesCount,
    previousPurchasesCount,
    due,
    suppliers,
    rawMaterials,
    resaleProducts,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ bucket: string; resale: boolean; total: string }>>`
      SELECT
        to_char((p."purchase_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', ${bucketFormat[period.granularity]}) AS bucket,
        (l."product_id" IS NOT NULL) AS resale,
        SUM(l."line_total_tnd")::text AS total
      FROM "purchase_lines" l
      JOIN "purchases" p ON p."id" = l."purchase_id"
      WHERE p."status" = 'POSTED'
        AND p."purchase_date" >= ${period.start}
        AND p."purchase_date" <= ${period.end}
      GROUP BY 1, 2
    `,
    purchaseTotalsByKind(prisma, period.previous.start, period.previous.end),
    prisma.purchase.count({ where: posted(period.start, period.end) }),
    prisma.purchase.count({
      where: posted(period.previous.start, period.previous.end),
    }),
    // What is still owed on the purchases of the window: their payable
    // less every payment still applied to them.
    prisma.$queryRaw<Array<{ due: string | null }>>`
      SELECT SUM(e."amount_tnd")::text AS due
      FROM "supplier_ledger_entries" e
      JOIN "purchases" p ON p."id" = e."purchase_id"
      WHERE p."status" = 'POSTED'
        AND p."purchase_date" >= ${period.start}
        AND p."purchase_date" <= ${period.end}
    `,
    prisma.$queryRaw<
      Array<{
        supplier_id: string;
        name: string;
        purchases: number;
        total: string;
        resale_total: string;
      }>
    >`
      SELECT
        s."id" AS supplier_id,
        s."name" AS name,
        COUNT(DISTINCT p."id")::int AS purchases,
        SUM(l."line_total_tnd")::text AS total,
        COALESCE(SUM(l."line_total_tnd") FILTER (WHERE l."product_id" IS NOT NULL), 0)::text AS resale_total
      FROM "purchase_lines" l
      JOIN "purchases" p ON p."id" = l."purchase_id"
      JOIN "suppliers" s ON s."id" = p."supplier_id"
      WHERE p."status" = 'POSTED'
        AND p."purchase_date" >= ${period.start}
        AND p."purchase_date" <= ${period.end}
      GROUP BY s."id", s."name"
      ORDER BY SUM(l."line_total_tnd") DESC, s."name" ASC
    `,
    // Quantities in the base unit; the first and the last price of the
    // window say whether the material got dearer.
    prisma.$queryRaw<
      Array<{
        raw_material_id: string;
        name: string;
        unit_name: string;
        quantity: string;
        total: string;
        purchases: number;
        first_price: string;
        last_price: string;
        last_at: Date;
      }>
    >`
      SELECT
        r."id" AS raw_material_id,
        r."name" AS name,
        u."name" AS unit_name,
        SUM(l."normalized_quantity")::text AS quantity,
        SUM(l."line_total_tnd")::text AS total,
        COUNT(DISTINCT p."id")::int AS purchases,
        (ARRAY_AGG(l."unit_price_tnd" ORDER BY p."purchase_date" ASC, p."created_at" ASC))[1]::text AS first_price,
        (ARRAY_AGG(l."unit_price_tnd" ORDER BY p."purchase_date" DESC, p."created_at" DESC))[1]::text AS last_price,
        MAX(p."purchase_date") AS last_at
      FROM "purchase_lines" l
      JOIN "purchases" p ON p."id" = l."purchase_id"
      JOIN "raw_materials" r ON r."id" = l."raw_material_id"
      JOIN "units" u ON u."id" = r."base_unit_id"
      WHERE p."status" = 'POSTED'
        AND p."purchase_date" >= ${period.start}
        AND p."purchase_date" <= ${period.end}
      GROUP BY r."id", r."name", u."name"
      ORDER BY SUM(l."line_total_tnd") DESC, r."name" ASC
    `,
    // Bought beside sold: the quantity that left over the same window on
    // the till, on direct distributor sales and on settlements.
    prisma.$queryRaw<
      Array<{
        product_id: string;
        name: string;
        unit_name: string;
        sale_price: string;
        quantity: string;
        total: string;
        purchases: number;
        last_price: string;
        last_at: Date;
        sold_quantity: string;
        sold_revenue: string;
      }>
    >`
      SELECT
        b."product_id" AS product_id,
        pr."name" AS name,
        u."name" AS unit_name,
        pr."sale_price_tnd"::text AS sale_price,
        b."quantity"::text AS quantity,
        b."total"::text AS total,
        b."purchases" AS purchases,
        b."last_price"::text AS last_price,
        b."last_at" AS last_at,
        COALESCE(s."sold_quantity", 0)::text AS sold_quantity,
        COALESCE(s."sold_revenue", 0)::text AS sold_revenue
      FROM (
        SELECT
          l."product_id" AS "product_id",
          SUM(l."normalized_quantity") AS "quantity",
          SUM(l."line_total_tnd") AS "total",
          COUNT(DISTINCT p."id")::int AS "purchases",
          (ARRAY_AGG(l."unit_price_tnd" ORDER BY p."purchase_date" DESC, p."created_at" DESC))[1] AS "last_price",
          MAX(p."purchase_date") AS "last_at"
        FROM "purchase_lines" l
        JOIN "purchases" p ON p."id" = l."purchase_id"
        WHERE l."product_id" IS NOT NULL
          AND p."status" = 'POSTED'
          AND p."purchase_date" >= ${period.start}
          AND p."purchase_date" <= ${period.end}
        GROUP BY l."product_id"
      ) b
      JOIN "products" pr ON pr."id" = b."product_id"
      JOIN "units" u ON u."id" = pr."base_unit_id"
      LEFT JOIN (
        SELECT x."product_id" AS "product_id", SUM(x."quantity") AS "sold_quantity", SUM(x."total") AS "sold_revenue"
        FROM (
          SELECT sl."product_id" AS "product_id", sl."quantity" AS "quantity", sl."line_total_tnd" AS "total"
          FROM "sale_lines" sl
          JOIN "sales" sa ON sa."id" = sl."sale_id"
          WHERE sa."status" = 'POSTED'
            AND sa."sold_at" >= ${period.start}
            AND sa."sold_at" <= ${period.end}
          UNION ALL
          SELECT dl."product_id", dl."quantity", dl."line_total_tnd"
          FROM "distributor_sale_lines" dl
          JOIN "distributor_sales" d ON d."id" = dl."sale_id"
          WHERE d."status" = 'POSTED'
            AND d."sold_at" >= ${period.start}
            AND d."sold_at" <= ${period.end}
          UNION ALL
          SELECT tl."product_id", tl."sold_quantity", tl."line_total_tnd"
          FROM "distributor_settlement_lines" tl
          JOIN "distributor_settlements" t ON t."id" = tl."settlement_id"
          WHERE tl."sold_quantity" > 0
            AND t."settled_at" >= ${period.start}
            AND t."settled_at" <= ${period.end}
        ) x
        GROUP BY x."product_id"
      ) s ON s."product_id" = b."product_id"
      ORDER BY b."total" DESC, pr."name" ASC
    `,
  ]);

  const byBucket = new Map<
    string,
    { rawMaterials: Prisma.Decimal; resale: Prisma.Decimal }
  >();
  for (const row of buckets) {
    const bucket = byBucket.get(row.bucket) ?? {
      rawMaterials: zero,
      resale: zero,
    };
    if (row.resale) {
      bucket.resale = bucket.resale.plus(row.total);
    } else {
      bucket.rawMaterials = bucket.rawMaterials.plus(row.total);
    }
    byBucket.set(row.bucket, bucket);
  }
  const rawMaterialsTnd = [...byBucket.values()].reduce(
    (sum, bucket) => sum.plus(bucket.rawMaterials),
    zero,
  );
  const resaleTnd = [...byBucket.values()].reduce(
    (sum, bucket) => sum.plus(bucket.resale),
    zero,
  );
  const perUnit = (total: string, quantity: string) => {
    const count = new Prisma.Decimal(quantity);
    return count.isZero()
      ? null
      : new Prisma.Decimal(total).dividedBy(count).toFixed(3);
  };

  return {
    period: describePeriod(period),
    generatedAt: new Date(),
    totals: {
      totalTnd: rawMaterialsTnd.plus(resaleTnd).toFixed(3),
      previousTotalTnd: previous.rawMaterialsTnd
        .plus(previous.resaleTnd)
        .toFixed(3),
      rawMaterialsTnd: rawMaterialsTnd.toFixed(3),
      previousRawMaterialsTnd: previous.rawMaterialsTnd.toFixed(3),
      resaleTnd: resaleTnd.toFixed(3),
      previousResaleTnd: previous.resaleTnd.toFixed(3),
      purchasesCount,
      previousPurchasesCount,
      remainingDueTnd: new Prisma.Decimal(due[0]?.due ?? 0).toFixed(3),
    },
    // Every bucket of the window, so a day without a purchase is a zero.
    trend: period.buckets.map((bucket) => {
      const row = byBucket.get(bucket);
      return {
        bucket,
        rawMaterialsTnd: (row?.rawMaterials ?? zero).toFixed(3),
        resaleTnd: (row?.resale ?? zero).toFixed(3),
      };
    }),
    suppliers: suppliers.map((row) => {
      const total = new Prisma.Decimal(row.total);
      const resale = new Prisma.Decimal(row.resale_total);
      return {
        supplierId: row.supplier_id,
        name: row.name,
        purchasesCount: row.purchases,
        totalTnd: total.toFixed(3),
        rawMaterialsTnd: total.minus(resale).toFixed(3),
        resaleTnd: resale.toFixed(3),
      };
    }),
    rawMaterials: rawMaterials.map((row) => {
      const first = new Prisma.Decimal(row.first_price);
      const last = new Prisma.Decimal(row.last_price);
      return {
        rawMaterialId: row.raw_material_id,
        name: row.name,
        unitName: row.unit_name,
        quantity: new Prisma.Decimal(row.quantity).toFixed(3),
        totalTnd: new Prisma.Decimal(row.total).toFixed(3),
        purchasesCount: row.purchases,
        averagePriceTnd: perUnit(row.total, row.quantity),
        firstPriceTnd: first.toFixed(3),
        lastPriceTnd: last.toFixed(3),
        /// Whole percent between the first and the last price paid in the
        /// window; zero when it was bought once.
        priceChangePercent: percentOf(last.minus(first), first) ?? 0,
        lastPurchasedAt: row.last_at,
      };
    }),
    resaleProducts: resaleProducts.map((row) => {
      const lastPrice = new Prisma.Decimal(row.last_price);
      return {
        productId: row.product_id,
        name: row.name,
        unitName: row.unit_name,
        quantity: new Prisma.Decimal(row.quantity).toFixed(3),
        totalTnd: new Prisma.Decimal(row.total).toFixed(3),
        purchasesCount: row.purchases,
        averagePriceTnd: perUnit(row.total, row.quantity),
        lastPriceTnd: lastPrice.toFixed(3),
        lastPurchasedAt: row.last_at,
        soldQuantity: new Prisma.Decimal(row.sold_quantity).toFixed(3),
        soldRevenueTnd: new Prisma.Decimal(row.sold_revenue).toFixed(3),
        salePriceTnd: new Prisma.Decimal(row.sale_price).toFixed(3),
        /// Today's sale price less the last purchase price; the owner's
        /// figure, absent without `margin.view`.
        unitMarginTnd: withMargin
          ? new Prisma.Decimal(row.sale_price).minus(lastPrice).toFixed(3)
          : null,
      };
    }),
  };
}
