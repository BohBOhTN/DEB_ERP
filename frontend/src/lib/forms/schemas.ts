import { z } from "zod";
import { parseDecimalInput } from "../../i18n/format.js";

/// Shared zod helpers for forms (06 section 2). Every message is French and
/// every money or quantity value is a decimal string, never a float.
const decimalPattern = (scale: number) =>
  new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);

/// A decimal string with at most `scale` decimals. Accepts what the user
/// typed with a comma and normalises it, so `"12,5"` becomes `"12.5"`.
export function decimalString(
  scale: number,
  options: { min?: string; positive?: boolean } = {},
) {
  return z
    .string()
    .trim()
    .min(1, "Ce champ est obligatoire.")
    .transform((value, context) => {
      // Parsed at full precision so extra decimals are refused, not rounded.
      const parsed = parseDecimalInput(value, 10);

      if (
        parsed === null ||
        !decimalPattern(scale).test(parsed.replace(/^-/, ""))
      ) {
        context.addIssue({
          code: "custom",
          message: `Saisissez un nombre avec au plus ${scale} décimale${scale > 1 ? "s" : ""}.`,
        });
        return z.NEVER;
      }

      if (parsed.startsWith("-")) {
        context.addIssue({
          code: "custom",
          message: "La valeur ne peut pas être négative.",
        });
        return z.NEVER;
      }

      if (options.positive && Number(parsed) === 0) {
        context.addIssue({
          code: "custom",
          message: "La valeur doit être supérieure à zéro.",
        });
        return z.NEVER;
      }

      if (options.min !== undefined && Number(parsed) < Number(options.min)) {
        context.addIssue({
          code: "custom",
          message: `La valeur doit être au moins ${options.min.replace(".", ",")}.`,
        });
        return z.NEVER;
      }

      return parsed;
    });
}

/// TND amount, three decimals, zero allowed unless `positive`.
export const tnd = (options: { positive?: boolean } = {}) =>
  decimalString(3, options);

/// Quantity, three decimals, strictly positive by default.
export const quantity = (
  options: { positive?: boolean } = { positive: true },
) => decimalString(3, options);

/// Tunisian phone numbers are 8 digits; international forms are accepted.
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{8,16}$/, "Saisissez un numéro de téléphone valide.");

export const optionalPhone = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(phone.optional());

export function requiredString(min = 1, max = 120) {
  return z
    .string()
    .trim()
    .min(
      min,
      min === 1
        ? "Ce champ est obligatoire."
        : `Saisissez au moins ${min} caractères.`,
    )
    .max(max, `Saisissez au plus ${max} caractères.`);
}

export function optionalString(max = 500) {
  return z
    .string()
    .trim()
    .max(max, `Saisissez au plus ${max} caractères.`)
    .transform((value) => (value === "" ? undefined : value));
}

export const email = z
  .string()
  .trim()
  .email("Saisissez une adresse e-mail valide.");

export const reason = requiredString(5, 300);

/// `YYYY-MM-DD` from a `DateInput`.
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Saisissez une date valide.");
