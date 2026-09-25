import Decimal from "decimal.js-light";
import { z } from "zod";
import {
  decimalString,
  isoDate,
  optionalPhone,
  optionalString,
  requiredString,
  tnd,
} from "../../lib/forms/schemas.js";

export const distributorSchema = z.object({
  name: requiredString(2, 120),
  phone: optionalPhone,
  address: optionalString(200),
  taxIdentifier: optionalString(40),
  notes: optionalString(500),
});
export type DistributorFormInput = z.input<typeof distributorSchema>;
export type DistributorFormOutput = z.output<typeof distributorSchema>;

const pickedOption = z.object({ value: z.string(), label: z.string() });

/// Dispatch (DST-011 to DST-013): a distributor, a date, product lines with
/// quantities only; no price, since nothing is sold yet.
export const dispatchSchema = z.object({
  distributor: pickedOption
    .nullable()
    .refine((value) => value !== null, "Choisissez un distributeur."),
  dispatchedAt: isoDate,
  notes: optionalString(500),
  lines: z
    .array(
      z.object({
        key: z.string(),
        item: pickedOption
          .nullable()
          .refine((item) => item !== null, "Choisissez un produit."),
        quantity: decimalString(3, { positive: true }),
        unitId: z.string().nullable().optional(),
        unitPriceTnd: z.string().default(""),
      }),
    )
    .min(1, "Ajoutez au moins une ligne."),
});
export type DispatchFormInput = z.input<typeof dispatchSchema>;
export type DispatchFormOutput = z.output<typeof dispatchSchema>;

/// Direct sale (DST-004 to DST-009): prices entered per line and snapshotted
/// (OD-006 default); a remainder becomes distributor receivable.
export const directSaleSchema = z
  .object({
    distributor: pickedOption
      .nullable()
      .refine((value) => value !== null, "Choisissez un distributeur."),
    soldAt: isoDate,
    notes: optionalString(500),
    paidAmountTnd: z.string().default(""),
    lines: z
      .array(
        z.object({
          key: z.string(),
          item: pickedOption
            .nullable()
            .refine((item) => item !== null, "Choisissez un produit."),
          quantity: decimalString(3, { positive: true }),
          unitId: z.string().nullable().optional(),
          unitPriceTnd: tnd(),
        }),
      )
      .min(1, "Ajoutez au moins une ligne."),
  })
  .superRefine((values, context) => {
    const total = values.lines.reduce(
      (sum, line) =>
        sum.plus(
          safeDecimal(line.quantity).times(safeDecimal(line.unitPriceTnd)),
        ),
      new Decimal(0),
    );
    if (
      values.paidAmountTnd.trim() !== "" &&
      safeDecimal(values.paidAmountTnd).greaterThan(total)
    ) {
      context.addIssue({
        code: "custom",
        path: ["paidAmountTnd"],
        message: "Le montant payé dépasse le total de la vente.",
      });
    }
  });
export type DirectSaleFormInput = z.input<typeof directSaleSchema>;
export type DirectSaleFormOutput = z.output<typeof directSaleSchema>;

/// One settlement line (section 14.4 invariant): sold + returned + still
/// held + unaccounted must equal what the line still holds; the price is
/// per unit sold.
export interface SettlementLineValues {
  dispatchLineId: string;
  productName: string;
  unitName: string;
  heldQuantity: string;
  soldQuantity: string;
  returnedQuantity: string;
  stillHeldQuantity: string;
  unaccountedQuantity: string;
  unitPriceTnd: string;
}

const optionalQuantity = z.string().default("");

export const settlementSchema = z
  .object({
    settledAt: isoDate,
    notes: optionalString(500),
    paidAmountTnd: z.string().default(""),
    lines: z.array(
      z.object({
        dispatchLineId: z.string(),
        productName: z.string(),
        unitName: z.string(),
        heldQuantity: z.string(),
        soldQuantity: optionalQuantity,
        returnedQuantity: optionalQuantity,
        stillHeldQuantity: optionalQuantity,
        unaccountedQuantity: optionalQuantity,
        unitPriceTnd: z.string().default(""),
      }),
    ),
  })
  .superRefine((values, context) => {
    let total = new Decimal(0);
    values.lines.forEach((line, index) => {
      const remainder = settlementRemainder(line);
      if (!remainder.isZero()) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "remainder"],
          message: remainder.greaterThan(0)
            ? `Il reste ${remainder.toString()} ${line.unitName} à classer.`
            : `Les quantités dépassent le dépôt de ${remainder.abs().toString()} ${line.unitName}.`,
        });
      }
      if (
        safeDecimal(line.soldQuantity).greaterThan(0) &&
        !/^\d+([.,]\d{1,3})?$/.test(line.unitPriceTnd.trim())
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "unitPriceTnd"],
          message: "Indiquez le prix unitaire des quantités vendues.",
        });
      }
      total = total.plus(
        safeDecimal(line.soldQuantity).times(safeDecimal(line.unitPriceTnd)),
      );
    });
    if (
      values.paidAmountTnd.trim() !== "" &&
      safeDecimal(values.paidAmountTnd).greaterThan(total)
    ) {
      context.addIssue({
        code: "custom",
        path: ["paidAmountTnd"],
        message: "Le montant payé dépasse le montant vendu.",
      });
    }
  });
export type SettlementFormInput = z.input<typeof settlementSchema>;
export type SettlementFormOutput = z.output<typeof settlementSchema>;

/// What is left to classify on a line: held − (sold + returned + still held
/// + unaccounted). Zero means the equation holds.
export function settlementRemainder(
  line: Pick<
    SettlementLineValues,
    | "heldQuantity"
    | "soldQuantity"
    | "returnedQuantity"
    | "stillHeldQuantity"
    | "unaccountedQuantity"
  >,
): Decimal {
  return safeDecimal(line.heldQuantity)
    .minus(safeDecimal(line.soldQuantity))
    .minus(safeDecimal(line.returnedQuantity))
    .minus(safeDecimal(line.stillHeldQuantity))
    .minus(safeDecimal(line.unaccountedQuantity));
}

export function settlementLineTotal(
  line: Pick<SettlementLineValues, "soldQuantity" | "unitPriceTnd">,
): Decimal {
  return safeDecimal(line.soldQuantity)
    .times(safeDecimal(line.unitPriceTnd))
    .toDecimalPlaces(3);
}

export const distributorPaymentSchema = z
  .object({
    distributor: pickedOption
      .nullable()
      .refine((value) => value !== null, "Choisissez un distributeur."),
    paidAt: isoDate,
    amountTnd: tnd({ positive: true }),
    reference: optionalString(80),
    notes: optionalString(500),
    balanceTnd: z.string().default("0"),
    allocations: z
      .array(
        z.object({
          id: z.string(),
          kind: z.enum(["sale", "settlement"]),
          reference: z.string(),
          at: z.string(),
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
        message: "Le montant dépasse le solde dû du distributeur.",
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
          message: "Dépasse le reste dû de ce document.",
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
export type DistributorPaymentFormInput = z.input<
  typeof distributorPaymentSchema
>;
export type DistributorPaymentFormOutput = z.output<
  typeof distributorPaymentSchema
>;

export function safeDecimal(
  value: string | number | null | undefined,
): Decimal {
  try {
    return new Decimal(String(value ?? "").replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}
