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

/// What payments still settle, from the `PAYMENT` and `PAYMENT_REVERSAL`
/// entries of a party ledger (issue 016). A payment reduces a balance with
/// a negative entry and a reversal gives it back with a positive one, so a
/// group whose sum is negative is still applied by that much, and a group
/// at zero has already been taken back. Reversing "the `PAYMENT` entries"
/// instead of this net is how a payment came back twice: once when its
/// purchase was cancelled, once when the payment itself was cancelled.
///
/// Entries are grouped by `keyOf` (the document for one payment, the
/// payment for one document); each group answers with its first entry, for
/// the columns a reversal copies, and the amount still applied (positive).
export function appliedPaymentEntries<
  TEntry extends { amountTnd: Prisma.Decimal | string },
>(
  entries: TEntry[],
  keyOf: (entry: TEntry) => string,
): Array<{ entry: TEntry; appliedTnd: Prisma.Decimal }> {
  const groups = new Map<string, { entry: TEntry; net: Prisma.Decimal }>();

  for (const entry of entries) {
    const key = keyOf(entry);
    const group = groups.get(key);

    if (group) {
      group.net = group.net.plus(entry.amountTnd);
    } else {
      groups.set(key, { entry, net: new Prisma.Decimal(entry.amountTnd) });
    }
  }

  return [...groups.values()]
    .filter((group) => group.net.lessThan(0))
    .map((group) => ({ entry: group.entry, appliedTnd: group.net.negated() }));
}
