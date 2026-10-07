import { Prisma } from "@prisma/client";

/// `to_char` patterns per granularity; constants, never request input.
export const bucketFormat = {
  day: Prisma.sql`'YYYY-MM-DD'`,
  month: Prisma.sql`'YYYY-MM'`,
} as const;

/// Whole percentage of `part` in `whole`, or `null` when there is nothing
/// to divide by.
export function percentOf(
  part: Prisma.Decimal,
  whole: Prisma.Decimal,
): number | null {
  return whole.isZero()
    ? null
    : part.dividedBy(whole).times(100).toDecimalPlaces(0).toNumber();
}
