import Decimal from "decimal.js-light";
import { z } from "zod";
import {
  isoDate,
  optionalPhone,
  optionalString,
  requiredString,
  tnd,
} from "../../lib/forms/schemas.js";

export const customerSchema = z.object({
  name: requiredString(2, 120),
  phone: optionalPhone,
  address: optionalString(200),
  taxIdentifier: optionalString(40),
  notes: optionalString(500),
});
export type CustomerFormInput = z.input<typeof customerSchema>;
export type CustomerFormOutput = z.output<typeof customerSchema>;

/// Customer payment (07 section 4.4, OD-009 default): overpayment refused
/// inline, allocations optional, each at most the sale's remaining due and
/// their sum at most the amount.
export const customerPaymentSchema = z
  .object({
    customer: z
      .object({ value: z.string(), label: z.string() })
      .nullable()
      .refine((customer) => customer !== null, "Choisissez un client."),
    paidAt: isoDate,
    amountTnd: tnd({ positive: true }),
    reference: optionalString(80),
    notes: optionalString(500),
    collectedAtPos: z.boolean().default(false),
    balanceTnd: z.string().default("0"),
    allocations: z
      .array(
        z.object({
          saleId: z.string(),
          reference: z.string(),
          soldAt: z.string(),
          balanceTnd: z.string(),
          amountTnd: z.string().default(""),
        }),
      )
      .default([]),
  })
  .superRefine((values, context) => {
    const amount = safeDecimal(values.amountTnd);

    if (amount.greaterThan(values.balanceTnd)) {
      context.addIssue({
        code: "custom",
        path: ["amountTnd"],
        message: "Le montant dépasse le reste à payer du client.",
      });
    }

    let allocated = new Decimal(0);
    values.allocations.forEach((allocation, index) => {
      if (allocation.amountTnd.trim() === "") return;
      const value = safeDecimal(allocation.amountTnd);
      if (value.greaterThan(allocation.balanceTnd)) {
        context.addIssue({
          code: "custom",
          path: ["allocations", index, "amountTnd"],
          message: "Dépasse le reste dû de cette vente.",
        });
      }
      allocated = allocated.plus(value);
    });

    if (allocated.greaterThan(amount)) {
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "La somme des affectations dépasse le montant encaissé.",
      });
    }
  });
export type CustomerPaymentFormInput = z.input<typeof customerPaymentSchema>;
export type CustomerPaymentFormOutput = z.output<typeof customerPaymentSchema>;

export function safeDecimal(
  value: string | number | null | undefined,
): Decimal {
  try {
    return new Decimal(String(value ?? "").replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}
