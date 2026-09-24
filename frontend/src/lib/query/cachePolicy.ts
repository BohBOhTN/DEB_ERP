/// One cache policy for every server-state query (UI-26). A query names its
/// tier instead of choosing numbers, so a screen never re-fetches what does
/// not change and never shows what is too old.
///
/// - `reference`: units, categories, expense categories, the permission
///   catalogue, roles, audit filters, the build identity. Read once per
///   session, kept for the whole session, refreshed only after their own
///   mutation (never on window focus).
/// - `list`: paginated tables. Half a minute of staleness, refreshed when
///   the window regains focus; the hook keeps the previous page on screen
///   while the next one loads.
/// - `document`: one record's detail. A minute, refreshed on focus.
/// - `live`: totals and states that other users change under our feet:
///   the open till, stock balances, custody, the home summary.
export type CacheTier = "reference" | "list" | "document" | "live";

export interface TierOptions {
  staleTime: number;
  gcTime: number;
  refetchOnWindowFocus: boolean;
}

const minute = 60_000;

export const cacheTiers: Record<CacheTier, TierOptions> = {
  reference: {
    staleTime: 30 * minute,
    gcTime: 24 * 60 * minute,
    refetchOnWindowFocus: false,
  },
  list: {
    staleTime: 30_000,
    gcTime: 5 * minute,
    refetchOnWindowFocus: true,
  },
  document: {
    staleTime: minute,
    gcTime: 10 * minute,
    refetchOnWindowFocus: true,
  },
  live: {
    staleTime: 15_000,
    gcTime: 5 * minute,
    refetchOnWindowFocus: true,
  },
};

/// Spread into `useQuery` / `prefetchQuery` options: `...tier("reference")`.
export function tier(name: CacheTier): TierOptions {
  return cacheTiers[name];
}
