import Decimal from "decimal.js-light";
import { z } from "zod";
import { toBusinessDate } from "../../i18n/format.js";
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
  unitPriceTnd: tnd({ positive: true }),
  /// Factor of the chosen unit to the base unit, kept on the line so the
  /// schema can total without the catalogue.
  factorToBase: z.string().default("1"),
});

/// The header fields a purchase and a shopping trip share: the store, the
/// date, the ticket reference, the notes, and how the raw materials are
/// paid.
const purchaseHeaderFields = {
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
};

type PurchaseRuleValues = {
  purchaseDate: string;
  paymentTerms: "PAID" | "PARTIAL" | "UNPAID";
  paidAmountTnd: string;
  dueDate: string;
  lines: Array<{
    item: { value: string } | null;
    quantity: string;
    unitPriceTnd: string;
    factorToBase?: string;
  }>;
};

/// Issue 016: the rules the server enforces, said on the field before any
/// request: no date in the future, one line per material, a positive line
/// total, the paid amount and the due date the terms call for. The payment
/// rules apply only when there are lines: a trip of expenses alone has no
/// purchase to pay (issue 018).
function addPurchaseIssues(
  values: PurchaseRuleValues,
  context: z.RefinementCtx,
): void {
  if (values.purchaseDate > toBusinessDate(new Date())) {
    context.addIssue({
      code: "custom",
      path: ["purchaseDate"],
      message: "La date d'achat ne peut pas être dans le futur.",
    });
  }

  const firstLineOf = new Map<string, number>();
  values.lines.forEach((line, index) => {
    const material = line.item?.value;
    if (material && firstLineOf.has(material)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "item"],
        message: "Cette matière première est déjà sur une autre ligne.",
      });
    } else if (material) {
      firstLineOf.set(material, index);
    }

    if (!purchaseLineTotal(line).greaterThan(0)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "unitPriceTnd"],
        message: "Le total de la ligne doit être supérieur à zéro.",
      });
    }
  });

  if (values.lines.length === 0) {
    return;
  }

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
    } else if (paid.lessThanOrEqualTo(0) || paid.greaterThanOrEqualTo(total)) {
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
  } else if (
    /^\d{4}-\d{2}-\d{2}$/.test(values.dueDate) &&
    values.dueDate < values.purchaseDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["dueDate"],
      message: "L'échéance ne peut pas précéder la date d'achat.",
    });
  }
}

/// Purchase editor (07 section 4.3, SUP-006 to SUP-008): terms drive the paid
/// amount and the due date; `0 < paid < total` for a partial purchase; a due
/// date whenever a balance remains.
export const purchaseSchema = z
  .object({
    ...purchaseHeaderFields,
    lines: z.array(purchaseLineSchema).min(1, "Ajoutez au moins une ligne."),
  })
  .superRefine(addPurchaseIssues);
export type PurchaseFormInput = z.input<typeof purchaseSchema>;
export type PurchaseFormOutput = z.output<typeof purchaseSchema>;

/// One line of the other goods bought on a trip (issue 018): a category,
/// a label, an amount paid on the spot.
export const expenseLineSchema = z.object({
  key: z.string(),
  categoryId: z.string().nullable().default(null),
  description: z.string().default(""),
  amountTnd: z.string().default(""),
});

/// The shopping trip (issue 018, DEC-V2-009): the purchase rules on the
/// raw-material lines, the expense rules on the other lines, and at least
/// one line of either kind. The raw-material lines may be empty, unlike a
/// purchase of their own.
export const shoppingTripSchema = z
  .object({
    ...purchaseHeaderFields,
    lines: z.array(purchaseLineSchema).default([]),
    expenses: z.array(expenseLineSchema).default([]),
  })
  .superRefine((values, context) => {
    if (values.lines.length === 0 && values.expenses.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Ajoutez au moins une matière première ou une dépense.",
      });
    }

    addPurchaseIssues(values, context);

    values.expenses.forEach((line, index) => {
      if (!line.categoryId) {
        context.addIssue({
          code: "custom",
          path: ["expenses", index, "categoryId"],
          message: "Choisissez une catégorie.",
        });
      }
      if (line.description.trim().length < 2) {
        context.addIssue({
          code: "custom",
          path: ["expenses", index, "description"],
          message: "Indiquez le libellé.",
        });
      }
      if (
        !/^\d+([.,]\d{1,3})?$/.test(line.amountTnd.trim()) ||
        !safeDecimal(line.amountTnd).greaterThan(0)
      ) {
        context.addIssue({
          code: "custom",
          path: ["expenses", index, "amountTnd"],
          message: "Le montant doit être supérieur à zéro.",
        });
      }
    });
  });
export type ShoppingTripFormInput = z.input<typeof shoppingTripSchema>;
export type ShoppingTripFormOutput = z.output<typeof shoppingTripSchema>;

export function expensesTotal(lines: Array<{ amountTnd: string }>): Decimal {
  return lines.reduce(
    (sum, line) => sum.plus(safeDecimal(line.amountTnd)),
    new Decimal(0),
  );
}

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
