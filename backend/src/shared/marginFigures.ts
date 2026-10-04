import { Prisma, type PrismaClient } from "@prisma/client";
import { sumOrZero } from "./ledger.js";

export interface MarginFigures {
  revenueTnd: string;
  costedRevenueTnd: string;
  costTnd: string;
  marginTnd: string;
  uncostedLinesCount: number;
}

/// Issue 008 (DEC-V2-005): the approximate margin of posted till sales over
/// a period, from the cost snapshotted on each line. Lines without a cost
/// are left out of the margin and counted, so a screen can say what share
/// of the revenue the figure covers.
export async function marginFigures(
  prisma: Pick<PrismaClient, "$queryRaw">,
  from: Date,
  to: Date,
): Promise<MarginFigures> {
  const rows = await prisma.$queryRaw<
    Array<{
      revenue: Prisma.Decimal | null;
      costed_revenue: Prisma.Decimal | null;
      cost: Prisma.Decimal | null;
      uncosted_lines: bigint | number;
    }>
  >`
    SELECT
      SUM(l."line_total_tnd") AS revenue,
      SUM(CASE WHEN l."unit_cost_tnd" IS NOT NULL THEN l."line_total_tnd" END) AS costed_revenue,
      SUM(l."quantity" * l."unit_cost_tnd") AS cost,
      COUNT(*) FILTER (WHERE l."unit_cost_tnd" IS NULL) AS uncosted_lines
    FROM "sale_lines" l
    JOIN "sales" s ON s."id" = l."sale_id"
    WHERE s."status" = 'POSTED' AND s."sold_at" >= ${from} AND s."sold_at" <= ${to}
  `;
  const row = rows[0];
  const revenue = sumOrZero(row?.revenue);
  const costedRevenue = sumOrZero(row?.costed_revenue);
  const cost = sumOrZero(row?.cost).toDecimalPlaces(3);

  return {
    revenueTnd: revenue.toFixed(3),
    costedRevenueTnd: costedRevenue.toFixed(3),
    costTnd: cost.toFixed(3),
    marginTnd: costedRevenue.minus(cost).toFixed(3),
    uncostedLinesCount: Number(row?.uncosted_lines ?? 0),
  };
}
