import { formatInTimeZone } from "date-fns-tz";
import { businessTimeZone, toBusinessDate } from "../../i18n/format.js";

/// The five presets every list with a date dimension offers (issue #41).
/// `custom` is a single day or a range typed by the user.
export type PeriodPreset = "today" | "yesterday" | "week" | "month" | "custom";

export const periodPresets: PeriodPreset[] = [
  "today",
  "yesterday",
  "week",
  "month",
  "custom",
];

export const periodLabels: Record<PeriodPreset, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  week: "Cette semaine",
  month: "Ce mois",
  custom: "Personnalisée",
};

export interface PeriodValue {
  preset: PeriodPreset;
  /// Only read when the preset is `custom`; `YYYY-MM-DD` or empty.
  from: string;
  to: string;
}

export interface PeriodRange {
  from: string;
  to: string;
}

export function isPeriodPreset(value: string): value is PeriodPreset {
  return (periodPresets as string[]).includes(value);
}

/// Moves a `YYYY-MM-DD` business date by whole days without touching time
/// zones: the date is a calendar day in Tunis, never an instant.
export function shiftBusinessDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}

/// The business-day range a period resolves to, in `Africa/Tunis`: today,
/// yesterday, Monday to today, the 1st to today, or what the user typed. A
/// custom period with one date is that single day; with none it is every
/// date (no filter).
export function periodRange(value: PeriodValue, now = new Date()): PeriodRange {
  const today = toBusinessDate(now);

  switch (value.preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yesterday = shiftBusinessDate(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "week": {
      // ISO weekday in the business time zone: Monday is 1.
      const weekday = Number(formatInTimeZone(now, businessTimeZone, "i"));
      return { from: shiftBusinessDate(today, -(weekday - 1)), to: today };
    }
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "custom": {
      const from = value.from || value.to;
      const to = value.to || value.from;
      return from && to && from > to ? { from: to, to: from } : { from, to };
    }
  }
}

/// "Le 24/09/2026", "Du 21/09/2026 au 24/09/2026" or "Toutes les dates".
export function periodCaption(
  range: PeriodRange,
  formatDate: (value: string) => string,
): string {
  if (!range.from && !range.to) {
    return "Toutes les dates";
  }

  if (range.from === range.to) {
    return `Le ${formatDate(range.from)}`;
  }

  return `Du ${formatDate(range.from)} au ${formatDate(range.to)}`;
}

/// Reads the period from URL state (`period`, `from`, `to`), falling back
/// to the page's default preset when the parameter is missing or unknown.
export function periodFromParams(
  params: { period: string; from: string; to: string },
  defaultPreset: PeriodPreset,
): PeriodValue {
  const preset = isPeriodPreset(params.period) ? params.period : defaultPreset;

  return {
    preset,
    from: preset === "custom" ? params.from : "",
    to: preset === "custom" ? params.to : "",
  };
}

/// The URL patch for a period: dates are stored only for a custom period so
/// a preset link stays short and keeps resolving to the current day.
export function periodToParams(value: PeriodValue): {
  period: PeriodPreset;
  from: string;
  to: string;
} {
  return {
    period: value.preset,
    from: value.preset === "custom" ? value.from : "",
    to: value.preset === "custom" ? value.to : "",
  };
}
