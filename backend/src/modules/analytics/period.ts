import { AppError } from "../../shared/appError.js";
import {
  businessDateOf,
  endOfBusinessDay,
  startOfBusinessDay,
} from "../../shared/listQuery.js";
import { messages } from "../../shared/messages.js";

/// The window an analysis reads, as business days in Tunis, with the window
/// of equal length just before it for the comparison figures.
export interface AnalyticsPeriod {
  /// First and last business day, `YYYY-MM-DD`, both included.
  from: string;
  to: string;
  days: number;
  start: Date;
  end: Date;
  previous: { from: string; to: string; start: Date; end: Date };
  /// Daily buckets up to `dailyBucketLimit` days, monthly above.
  granularity: "day" | "month";
  /// Every bucket of the window in order (`YYYY-MM-DD` or `YYYY-MM`), so a
  /// day without a sale is a zero on the chart and not a hole.
  buckets: string[];
}

export const defaultPeriodDays = 30;
export const maxPeriodDays = 366;
export const dailyBucketLimit = 92;

const dayMs = 24 * 60 * 60 * 1000;

function utcOf(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/// Moves a business day by whole days; a calendar operation, never an
/// instant, so it is immune to time zones.
export function shiftDay(day: string, days: number): string {
  return new Date(utcOf(day) + days * dayMs).toISOString().slice(0, 10);
}

/// ISO weekday of a business day: Monday is 1, Sunday is 7.
export function weekdayOf(day: string): number {
  return ((new Date(utcOf(day)).getUTCDay() + 6) % 7) + 1;
}

export function daysOf(from: string, to: string): string[] {
  const count = Math.round((utcOf(to) - utcOf(from)) / dayMs) + 1;

  return Array.from({ length: count }, (_, index) => shiftDay(from, index));
}

/// Resolves the `from`/`to` of a request: the last thirty days by default,
/// thirty days up to `to` when only `to` is given, `from` up to today when
/// only `from` is given.
export function resolvePeriod(
  query: { from?: string; to?: string },
  now = new Date(),
): AnalyticsPeriod {
  const today = businessDateOf(now);
  const to =
    query.to ?? (query.from && query.from > today ? query.from : today);
  const from = query.from ?? shiftDay(to, -(defaultPeriodDays - 1));

  if (from > to) {
    throw invalidPeriod({
      to: "La date de fin doit suivre la date de début.",
    });
  }

  const days = daysOf(from, to);

  if (days.length > maxPeriodDays) {
    throw invalidPeriod({
      from: `La période ne peut pas dépasser ${maxPeriodDays} jours.`,
    });
  }

  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(from, -days.length);
  const granularity = days.length > dailyBucketLimit ? "month" : "day";

  return {
    from,
    to,
    days: days.length,
    start: startOfBusinessDay(from),
    end: endOfBusinessDay(to),
    previous: {
      from: previousFrom,
      to: previousTo,
      start: startOfBusinessDay(previousFrom),
      end: endOfBusinessDay(previousTo),
    },
    granularity,
    buckets:
      granularity === "day"
        ? days
        : [...new Set(days.map((day) => day.slice(0, 7)))],
  };
}

/// The window as every analysis answers it.
export function describePeriod(period: AnalyticsPeriod) {
  return {
    from: period.from,
    to: period.to,
    days: period.days,
    granularity: period.granularity,
    previousFrom: period.previous.from,
    previousTo: period.previous.to,
  };
}

function invalidPeriod(fieldErrors: Record<string, string>): AppError {
  return new AppError({
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: messages.VALIDATION_ERROR,
    fieldErrors,
  });
}
