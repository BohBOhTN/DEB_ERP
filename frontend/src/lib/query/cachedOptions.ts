import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { tier } from "./cachePolicy.js";
import type { QueryRoot } from "./invalidation.js";

/// The cache key of a picker's page for one query, under a root the
/// invalidation map already refreshes (issue 009).
export function pickerKey(root: QueryRoot, query: string) {
  return [...root, "picker", query] as const;
}

/// A picker loader that reads through the query client at the `reference`
/// tier: the first opening of a picker fetches, every later opening, line
/// or screen reads memory for the session, and a write to the underlying
/// records refreshes it through `invalidateAfter`. The empty query is
/// prefetched on mount so the first opening is instant. `fetch` must be
/// stable (a module function or a `useCallback`).
export function useCachedSearch<T>(
  root: QueryRoot,
  fetch: (query: string) => Promise<T>,
  options: { prefetch?: boolean } = {},
): (query: string) => Promise<T> {
  const queryClient = useQueryClient();
  const prefetch = options.prefetch ?? true;
  const search = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      return queryClient.fetchQuery({
        queryKey: pickerKey(root, trimmed),
        queryFn: () => fetch(trimmed),
        ...tier("reference"),
      });
    },
    [queryClient, root, fetch],
  );

  useEffect(() => {
    if (prefetch) {
      void search("").catch(() => undefined);
    }
  }, [prefetch, search]);

  return search;
}
