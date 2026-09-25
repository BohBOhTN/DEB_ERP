/// The `/api/v1` list contract (ADR-V2-004): every collection takes `page`,
/// `pageSize`, `q`, `sort=field:asc|desc` and returns a page. List screens
/// keep this state in the URL so the back button restores the exact list.
export type SortDirection = "asc" | "desc";

export interface SortSpec {
  field: string;
  direction: SortDirection;
}

export interface PageQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: SortSpec;
}

export interface PageResult<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export const defaultPageSize = 25;
export const pageSizeOptions = [10, 25, 50] as const;

export function emptyPage<TItem>(
  pageSize = defaultPageSize,
): PageResult<TItem> {
  return { items: [], page: 1, pageSize, total: 0, pageCount: 1 };
}

export function formatSort(sort: SortSpec): string {
  return `${sort.field}:${sort.direction}`;
}

export function parseSort(
  value: string | null | undefined,
): SortSpec | undefined {
  if (!value) {
    return undefined;
  }

  const [field, direction] = value.split(":");

  if (!field || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) {
    return undefined;
  }

  return {
    field,
    direction: direction === "desc" ? "desc" : "asc",
  };
}

/// Query values for the API client: only the keys that carry a value.
export function toSearchParams(
  query: PageQuery & Record<string, unknown>,
): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (key === "sort" && typeof value === "object") {
      params.sort = formatSort(value as SortSpec);
      continue;
    }

    if (value instanceof Date) {
      params[key] = value.toISOString();
      continue;
    }

    params[key] = String(value);
  }

  return params;
}

/// Reads the list state back from the URL, with the contract defaults.
export function fromSearchParams(
  params: URLSearchParams,
  options: { defaultSort?: SortSpec; maxPageSize?: number } = {},
): PageQuery {
  const page = positiveInt(params.get("page")) ?? 1;
  const pageSize = Math.min(
    positiveInt(params.get("pageSize")) ?? defaultPageSize,
    options.maxPageSize ?? 100,
  );
  const q = params.get("q")?.trim();
  const sort = parseSort(params.get("sort")) ?? options.defaultSort;

  return {
    page,
    pageSize,
    ...(q ? { q } : {}),
    ...(sort ? { sort } : {}),
  };
}

function positiveInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
