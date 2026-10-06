import { Prisma, type PrismaClient } from "@prisma/client";

/// What was bought over a window, split by what a line buys (issue 019): a
/// raw material, or a product flagged for resale. Posted purchases only, a
/// cancelled one is left out; a purchase counts on its purchase date for
/// its full amount, paid or not (issues 021 and 022).
export interface PurchaseKindTotals {
  rawMaterialsTnd: Prisma.Decimal;
  resaleTnd: Prisma.Decimal;
}

export async function purchaseTotalsByKind(
  prisma: Pick<PrismaClient, "$queryRaw">,
  start: Date,
  end: Date,
): Promise<PurchaseKindTotals> {
  const rows = await prisma.$queryRaw<
    Array<{ resale: boolean; total: string }>
  >`
    SELECT
      (l."product_id" IS NOT NULL) AS resale,
      SUM(l."line_total_tnd")::text AS total
    FROM "purchase_lines" l
    JOIN "purchases" p ON p."id" = l."purchase_id"
    WHERE p."status" = 'POSTED'
      AND p."purchase_date" >= ${start}
      AND p."purchase_date" <= ${end}
    GROUP BY 1
  `;
  const of = (resale: boolean) =>
    new Prisma.Decimal(rows.find((row) => row.resale === resale)?.total ?? 0);

  return { rawMaterialsTnd: of(false), resaleTnd: of(true) };
}
