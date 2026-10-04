import Decimal from "decimal.js-light";
import { formatInTimeZone } from "date-fns-tz";
import type { KpiDelta } from "../../components/patterns/KpiTile/KpiTile.js";
import {
  businessTimeZone,
  dateLocale,
  formatMoney,
} from "../../i18n/format.js";
import type { AnalyticsPeriod } from "./analytics.api.js";

/// ISO weekdays: Monday is 1.
const weekdays = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export function weekdayName(weekday: number): string {
  return weekdays[weekday - 1] ?? "";
}

export function weekdayShort(weekday: number): string {
  return weekdayName(weekday).slice(0, 3);
}

/// "9 h à 10 h": the hour a sale falls in, in Tunis.
export function hourSlot(hour: number): string {
  return `${hour} h à ${hour + 1} h`;
}

/// The change against the previous window of equal length, for a KPI tile.
/// A window with nothing before it says so instead of dividing by zero.
export function periodDelta(
  current: string | number,
  previous: string | number,
): KpiDelta {
  const now = new Decimal(current);
  const before = new Decimal(previous);

  if (before.isZero()) {
    return now.isZero()
      ? { label: "Comme la période précédente", direction: "flat" }
      : { label: "Rien sur la période précédente", direction: "up" };
  }

  const change = now
    .minus(before)
    .dividedBy(before)
    .times(100)
    .toDecimalPlaces(0);
  const direction = change.greaterThan(0)
    ? "up"
    : change.lessThan(0)
      ? "down"
      : "flat";
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";

  return {
    label: `${sign}${change.abs().toString()} % vs période précédente`,
    direction,
  };
}

/// Whole percentage of `part` in `total`; zero when there is no total.
export function shareOf(part: string | number, total: string | number): number {
  const whole = new Decimal(total);

  return whole.isZero()
    ? 0
    : new Decimal(part)
        .dividedBy(whole)
        .times(100)
        .toDecimalPlaces(0)
        .toNumber();
}

export function moneyWithShare(amount: string, total: string | number): string {
  return `${formatMoney(amount)} · ${shareOf(amount, total)} %`;
}

/// A trend bucket (`YYYY-MM-DD` or `YYYY-MM`) as a readout label and an
/// axis tick. A bucket is a calendar day in Tunis, so it is formatted from
/// its noon to stay on that day in every time zone.
export function bucketLabels(
  bucket: string,
  granularity: AnalyticsPeriod["granularity"],
): { label: string; tick: string } {
  const day = granularity === "day" ? bucket : `${bucket}-01`;
  const noon = new Date(`${day}T12:00:00.000Z`);
  const format = (pattern: string) =>
    formatInTimeZone(noon, businessTimeZone, pattern, { locale: dateLocale });

  return granularity === "day"
    ? { label: format("EEEE dd/MM/yyyy"), tick: format("dd/MM") }
    : { label: format("MMMM yyyy"), tick: format("MM/yyyy") };
}
