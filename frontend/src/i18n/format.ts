import Decimal from "decimal.js-light";
import { fr as frLocale } from "date-fns/locale/fr";
import { formatInTimeZone } from "date-fns-tz";
import { fr, t } from "./fr.js";

/// Formatting rules from 05 section 4: `12,500 TND`, `2,5 kg`, `22/09/2026`,
/// `14:30`, relative time on `Accueil` only. Money never touches `Number`:
/// the API sends decimal strings and the inputs emit decimal strings.
export const businessTimeZone = "Africa/Tunis";
export const dateLocale = frLocale;

const nonBreakingSpace = String.fromCharCode(0xa0);
const narrowNonBreakingSpace = String.fromCharCode(0x202f);
const spacePattern = new RegExp(
  `[\\s${nonBreakingSpace}${narrowNonBreakingSpace}]`,
  "g",
);
const moneyFormatter = new Intl.NumberFormat("fr-TN", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const integerFormatter = new Intl.NumberFormat("fr-TN", {
  maximumFractionDigits: 0,
});

/// `formatMoney("12.5")` → "12,500 TND"; `formatMoney(null)` → "—".
export function formatMoney(
  value: string | number | Decimal | null | undefined,
  options: { unit?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = new Decimal(value).toFixed(3);
  const [whole, fraction] = amount.split(".");
  const formatted =
    `${integerFormatter.format(Number(whole))},${fraction}`.replace(
      /^-0,/,
      "-0,",
    );
  const withSign =
    amount.startsWith("-") && !formatted.startsWith("-")
      ? `-${formatted}`
      : formatted;

  return options.unit === false
    ? withSign
    : `${withSign}${nonBreakingSpace}${fr.currency}`;
}

/// `formatQuantity("2.5", "kg")` → "2,5 kg"; trailing zeros are dropped up to
/// three decimals so `1.000` reads as "1".
export function formatQuantity(
  value: string | number | Decimal | null | undefined,
  unit?: string | null,
  decimals = 3,
): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const quantity = new Decimal(value).toDecimalPlaces(decimals);
  const formatted = new Intl.NumberFormat("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(quantity.toNumber());

  return unit ? `${formatted}${nonBreakingSpace}${unit}` : formatted;
}

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  return value
    ? formatInTimeZone(toDate(value), businessTimeZone, "dd/MM/yyyy")
    : "—";
}

export function formatTime(value: Date | string | null | undefined): string {
  return value
    ? formatInTimeZone(toDate(value), businessTimeZone, "HH:mm")
    : "—";
}

export function formatDateTime(
  value: Date | string | null | undefined,
): string {
  return value
    ? formatInTimeZone(toDate(value), businessTimeZone, "dd/MM/yyyy HH:mm")
    : "—";
}

/// Long form for the `Accueil` greeting band: "lundi 22 septembre 2026".
export function formatDateLong(value: Date | string): string {
  return formatInTimeZone(toDate(value), businessTimeZone, "EEEE d MMMM yyyy", {
    locale: frLocale,
  });
}

/// Business-day key for API `date`, `from` and `to` parameters.
export function toBusinessDate(value: Date | string): string {
  return formatInTimeZone(toDate(value), businessTimeZone, "yyyy-MM-dd");
}

/// "à l'instant", "il y a 5 min", "il y a 3 h", "il y a 2 j", then the date.
export function formatRelative(
  value: Date | string,
  now: Date = new Date(),
): string {
  const elapsedMs = now.getTime() - toDate(value).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) {
    return fr.justNow;
  }

  if (minutes < 60) {
    return t("minutesAgo", { count: minutes });
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return t("hoursAgo", { count: hours });
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return t("daysAgo", { count: days });
  }

  return formatDate(value);
}

/// Turns what a user typed ("12,5", "1 250,000", "12.5") into the decimal
/// string the API expects ("12.5"), or `null` when it is not a number.
export function parseDecimalInput(input: string, scale = 3): string | null {
  const normalized = input.replace(spacePattern, "").replace(",", ".").trim();

  if (
    !/^-?\d*(\.\d*)?$/.test(normalized) ||
    normalized === "" ||
    normalized === "-"
  ) {
    return null;
  }

  try {
    return new Decimal(normalized).toDecimalPlaces(scale).toString();
  } catch {
    return null;
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export { moneyFormatter };
