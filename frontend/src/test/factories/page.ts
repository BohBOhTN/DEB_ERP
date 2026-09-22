import type { PageResult } from "../../lib/api/pagination.js";

/// A `/api/v1` page around `items`, with the counts derived so tests never
/// hand-write an inconsistent page.
export function makePage<T>(
  items: T[],
  overrides: Partial<Pick<PageResult<T>, "page" | "pageSize" | "total">> = {},
): PageResult<T> {
  const page = overrides.page ?? 1;
  const pageSize = overrides.pageSize ?? 25;
  const total = overrides.total ?? items.length;

  return {
    items,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
