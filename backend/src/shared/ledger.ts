import { Prisma } from "@prisma/client";

/// Prisma returns `null` for an aggregate over zero rows. Balances are money,
/// so the absence of entries is a zero balance, never "unknown".
export function sumOrZero(value: Prisma.Decimal | null | undefined) {
  return value ? new Prisma.Decimal(value) : new Prisma.Decimal(0);
}

export function money(value: Prisma.Decimal | null | undefined): string {
  return sumOrZero(value).toFixed(3);
}

/// Builds a lookup from a `groupBy` result keyed by one column, so callers can
/// read a per-document balance without scanning the ledger in JavaScript.
export function balancesByKey<TRow, TKey extends string>(
  rows: TRow[],
  key: (row: TRow) => TKey | null | undefined,
  sum: (row: TRow) => Prisma.Decimal | null | undefined,
): Map<TKey, Prisma.Decimal> {
  const map = new Map<TKey, Prisma.Decimal>();

  for (const row of rows) {
    const id = key(row);
    if (id) {
      map.set(id, sumOrZero(sum(row)));
    }
  }

  return map;
}

export function balanceOf<TKey extends string>(
  map: Map<TKey, Prisma.Decimal>,
  key: TKey,
): Prisma.Decimal {
  return map.get(key) ?? new Prisma.Decimal(0);
}

/// Statement paging: one more row than requested tells whether a next page
/// exists without a second count query.
export function pageWithCursor<TRow extends { id: string }>(
  rows: TRow[],
  limit: number,
): { items: TRow[]; nextCursor: string | null } {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }

  const items = rows.slice(0, limit);
  return { items, nextCursor: items[items.length - 1]?.id ?? null };
}

export const statementDefaults = {
  limit: 50,
  maxLimit: 200,
} as const;
