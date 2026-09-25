import Decimal from "decimal.js-light";
import { z } from "zod";
import {
  decimalString,
  optionalString,
  reason,
  tnd,
} from "../../lib/forms/schemas.js";

const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/// One editor line in the LineEditor's shape; the price is the product's
/// sale price, editable per line (07 section 4.5).
export const orderLineSchema = z.object({
  key: z.string(),
  item: z
    .object({ value: z.string(), label: z.string() })
    .nullable()
    .refine((item) => item !== null, "Choisissez un produit."),
  quantity: decimalString(3, { positive: true }),
  unitId: z.string().nullable().optional(),
  unitPriceTnd: tnd(),
});

/// Order editor (07 section 4.5, ORD-003, ORD-004, ORD-016): a registered
/// customer, a fulfilment time in the future, at least one line, and an
/// optional advance no larger than the total.
export const orderSchema = z
  .object({
    customer: z
      .object({ value: z.string(), label: z.string() })
      .nullable()
      .refine((customer) => customer !== null, "Choisissez un client."),
    requestedFulfillmentAt: z
      .string()
      .regex(localDateTime, "Indiquez la date et l'heure de retrait."),
    notes: optionalString(500),
    lines: z.array(orderLineSchema).min(1, "Ajoutez au moins une ligne."),
    advanceTnd: z.string().default(""),
  })
  .superRefine((values, context) => {
    if (new Date(values.requestedFulfillmentAt).getTime() <= Date.now()) {
      context.addIssue({
        code: "custom",
        path: ["requestedFulfillmentAt"],
        message: "Le retrait doit être dans le futur.",
      });
    }

    if (values.advanceTnd.trim() !== "") {
      const advance = safeDecimal(values.advanceTnd);
      const total = orderTotal(values.lines);
      if (advance.lessThanOrEqualTo(0)) {
        context.addIssue({
          code: "custom",
          path: ["advanceTnd"],
          message: "L'acompte doit être supérieur à zéro.",
        });
      } else if (advance.greaterThan(total)) {
        context.addIssue({
          code: "custom",
          path: ["advanceTnd"],
          message: "L'acompte ne peut pas dépasser le total de la commande.",
        });
      }
    }
  });
export type OrderFormInput = z.input<typeof orderSchema>;
export type OrderFormOutput = z.output<typeof orderSchema>;

export function orderTotal(
  lines: Array<{ quantity: string; unitPriceTnd: string }>,
): Decimal {
  return lines
    .reduce(
      (sum, line) =>
        sum.plus(
          safeDecimal(line.quantity).times(safeDecimal(line.unitPriceTnd)),
        ),
      new Decimal(0),
    )
    .toDecimalPlaces(3);
}

/// A deposit is capped by what remains of the order total (ORD-016), and
/// the form says so before any request (issue #45).
export const advanceSchema = z
  .object({
    amountTnd: tnd({ positive: true }),
    paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date."),
    notes: optionalString(300),
    remainingTnd: z.string().default("0"),
  })
  .superRefine((values, context) => {
    if (safeDecimal(values.amountTnd).greaterThan(values.remainingTnd)) {
      context.addIssue({
        code: "custom",
        path: ["amountTnd"],
        message: "L'acompte dépasse le reste à verser sur la commande.",
      });
    }
  });
export type AdvanceFormInput = z.input<typeof advanceSchema>;
export type AdvanceFormOutput = z.output<typeof advanceSchema>;

export const cancelOrderSchema = z.object({ reason });

export function safeDecimal(
  value: string | number | null | undefined,
): Decimal {
  try {
    return new Decimal(String(value ?? "").replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}
