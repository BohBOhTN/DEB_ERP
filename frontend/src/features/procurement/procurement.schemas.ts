import Decimal from "decimal.js-light";
import { z } from "zod";
import {
  decimalString,
  isoDate,
  optionalPhone,
  optionalString,
  reason,
  requiredString,
  tnd,
} from "../../lib/forms/schemas.js";

export const supplierSchema = z.object({
  name: requiredString(2, 120),
  phone: optionalPhone,
  taxIdentifier: optionalString(40),
  address: optionalString(200),
  notes: optionalString(500),
});
export type SupplierFormInput = z.input<typeof supplierSchema>;
export type SupplierFormOutput = z.output<typeof supplierSchema>;

/// One editor line, in the LineEditor's shape: the item is the picked raw
/// material, the unit is one of its conversions and the price is per base
/// unit, as the backend computes `normalizedQuantity × unitPriceTnd`.
export const purchaseLineSchema = z.object({
  key: z.string(),
  item: z
    .object({ value: z.string(), label: z.string() })
    .nullable()
    .refine((item) => item !== null, "Choisissez une matière première."),
  quantity: decimalString(6, { positive: true }),
  unitId: z.string().nullable().optional(),
  unitPriceTnd: tnd(),
  /// Factor of the chosen unit to the base unit, kept on the line so the
  /// schema can total without the catalogue.
  factorToBase: z.string().default("1"),
});

/// Purchase editor (07 section 4.3, SUP-006 to SUP-008): terms drive the paid
/// amount and the due date; `0 < paid < total` for a partial purchase; a due
/// date whenever a balance remains.
export const purchaseSchema = z
  .object({
    supplier: z
      .object({ value: z.string(), label: z.string() })
      .nullable()
      .refine((supplier) => supplier !== null, "Choisissez un fournisseur."),
    purchaseDate: isoDate,
    supplierReference: optionalString(80),
    notes: optionalString(500),
    paymentTerms: z.enum(["PAID", "PARTIAL", "UNPAID"]),
    paidAmountTnd: z.string().default(""),
    dueDate: z.string().default(""),
    lines: z.array(purchaseLineSchema).min(1, "Ajoutez au moins une ligne."),
  })
  .superRefine((values, context) => {
    const total = purchaseTotal(values.lines);
    const paid =
      values.paymentTerms === "PAID"
        ? total
        : values.paymentTerms === "UNPAID"
          ? new Decimal(0)
          : safeDecimal(values.paidAmountTnd);

    if (values.paymentTerms === "PARTIAL") {
      if (!/^\d+([.,]\d{1,3})?$/.test(values.paidAmountTnd.trim())) {
        context.addIssue({
          code: "custom",
          path: ["paidAmountTnd"],
          message: "Saisissez le montant payé.",
        });
      } else if (
        paid.lessThanOrEqualTo(0) ||
        paid.greaterThanOrEqualTo(total)
      ) {
        context.addIssue({
          code: "custom",
          path: ["paidAmountTnd"],
          message: "Un achat partiel est payé entre 0 et le total, exclus.",
        });
      }
    }

    if (paid.lessThan(total) && !/^\d{4}-\d{2}-\d{2}$/.test(values.dueDate)) {
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Indiquez l'échéance du reste à payer.",
      });
    }
  });
export type PurchaseFormInput = z.input<typeof purchaseSchema>;
export type PurchaseFormOutput = z.output<typeof purchaseSchema>;

/// Line total as the backend computes it: entered quantity × factor to the
/// base unit × price per base unit, three decimals.
export function purchaseLineTotal(line: {
  quantity: string;
  unitPriceTnd: string;
  factorToBase?: string;
}): Decimal {
  return safeDecimal(line.quantity)
    .times(safeDecimal(line.factorToBase ?? "1"))
    .times(safeDecimal(line.unitPriceTnd))
    .toDecimalPlaces(3);
}

export function purchaseTotal(
  lines: Array<{
    quantity: string;
    unitPriceTnd: string;
    factorToBase?: string;
  }>,
): Decimal {
  return lines.reduce(
    (sum, line) => sum.plus(purchaseLineTotal(line)),
    new Decimal(0),
  );
}

export const cancelPurchaseSchema = z.object({ reason });

/// Supplier payment (07 section 4.3): allocations are optional, each at most
/// the purchase's remaining due, and their sum at most the amount.
export const supplierPaymentSchema = z
  .object({
    supplier: z
      .object({ value: z.string(), label: z.string() })
      .nullable()
      .refine((supplier) => supplier !== null, "Choisissez un fournisseur."),
    paidAt: isoDate,
    amountTnd: tnd({ positive: true }),
    reference: optionalString(80),
    notes: optionalString(500),
    allocations: z
      .array(
        z.object({
          purchaseId: z.string(),
          reference: z.string().nullable(),
          dueDate: z.string().nullable(),
          balanceTnd: z.string(),
          amountTnd: z.string().default(""),
        }),
      )
      .default([]),
  })
  .superRefine((values, context) => {
    const amount = safeDecimal(values.amountTnd);
    let allocated = new Decimal(0);

    values.allocations.forEach((allocation, index) => {
      if (allocation.amountTnd.trim() === "") return;
      const value = safeDecimal(allocation.amountTnd);
      if (value.lessThan(0)) {
        context.addIssue({
          code: "custom",
          path: ["allocations", index, "amountTnd"],
          message: "Montant négatif.",
        });
      }
      if (value.greaterThan(allocation.balanceTnd)) {
        context.addIssue({
          code: "custom",
          path: ["allocations", index, "amountTnd"],
          message: "Dépasse le reste dû de cet achat.",
        });
      }
      allocated = allocated.plus(value);
    });

    if (allocated.greaterThan(amount)) {
      context.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "La somme des affectations dépasse le montant payé.",
      });
    }
  });
export type SupplierPaymentFormInput = z.input<typeof supplierPaymentSchema>;
export type SupplierPaymentFormOutput = z.output<typeof supplierPaymentSchema>;

export function safeDecimal(
  value: string | number | null | undefined,
): Decimal {
  try {
    return new Decimal(String(value ?? "").replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}
