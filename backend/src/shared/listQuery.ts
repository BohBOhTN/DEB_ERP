import { z } from "zod";

/// One list contract for every collection endpoint (ADR-V2-004):
/// `page`, `pageSize`, `q` (alias `search`), `sort=field:asc|desc` from a
/// per-list whitelist, and `from`/`to` interpreted as business days.

export const businessTimeZone = "Africa/Tunis";

export interface SortSpec<TField extends string = string> {
  field: TField;
  direction: "asc" | "desc";
}

export const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

/// `q` is the documented name; `search` is kept for the V1 screens. The
/// parsed value is exposed as `search` so services need no change.
export const searchFields = {
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
};

const sortPattern = /^([A-Za-z][A-Za-z0-9_]*)(?::(asc|desc))?$/;

/// Accepts `field`, `field:asc` or `field:desc`; rejects anything outside the
/// whitelist so a client can never sort on an arbitrary column.
export function sortField<const TField extends string>(
  fields: readonly TField[],
) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value, context): SortSpec<TField> | undefined => {
      if (!value) {
        return undefined;
      }

      const match = sortPattern.exec(value);
      const field = match?.[1] as TField | undefined;

      if (!match || !field || !fields.includes(field)) {
        context.addIssue({
          code: "custom",
          message: "Ce tri n'est pas disponible.",
        });
        return z.NEVER;
      }

      return {
        field,
        direction: (match[2] as "asc" | "desc" | undefined) ?? "asc",
      };
    });
}

/// `YYYY-MM-DD` means a whole business day in Tunis; a full ISO timestamp is
/// still accepted for clients that send an exact instant.
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export function businessDate(boundary: "start" | "end") {
  return z
    .string()
    .trim()
    .optional()
    .transform((value, context): Date | undefined => {
      if (!value) {
        return undefined;
      }

      if (dayPattern.test(value)) {
        return boundary === "start"
          ? startOfBusinessDay(value)
          : endOfBusinessDay(value);
      }

      const instant = new Date(value);
      if (Number.isNaN(instant.getTime())) {
        context.addIssue({
          code: "custom",
          message: "Cette date est invalide.",
        });
        return z.NEVER;
      }

      return instant;
    });
}

export const dateRangeFields = {
  from: businessDate("start"),
  to: businessDate("end"),
};

/// Resolves `search` from either alias after parsing.
export function withSearch<T extends { q?: string; search?: string }>(
  query: T,
): Omit<T, "q" | "search"> & { search?: string } {
  const { q, search, ...rest } = query;
  const resolved = search || q || undefined;
  return { ...rest, ...(resolved ? { search: resolved } : {}) };
}

/// Turns a sort spec into Prisma `orderBy` entries, always ending with the id
/// as a tiebreak so paging never repeats or skips a row (NFR-005).
export function orderByFor<TField extends string, TOrder>(
  sort: SortSpec<TField> | undefined,
  columns: Record<TField, (direction: "asc" | "desc") => TOrder[]>,
  fallback: TOrder[],
  tiebreak: TOrder,
): TOrder[] {
  const chosen = sort ? columns[sort.field](sort.direction) : fallback;
  return [...chosen, tiebreak];
}

/// The `YYYY-MM-DD` business day an instant falls on in Tunis.
export function businessDateOf(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function startOfBusinessDay(day: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00.000Z`);
  return new Date(utcMidnight.getTime() - zoneOffsetMs(utcMidnight));
}

export function endOfBusinessDay(day: string): Date {
  const start = startOfBusinessDay(day);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/// Offset of the business time zone at the given instant, in milliseconds,
/// derived from Intl so a future DST change needs no code change.
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: businessTimeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return asUtc - instant.getTime();
}
