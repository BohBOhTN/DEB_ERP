import { z } from "zod";
import {
  decimalString,
  optionalString,
  requiredString,
  tnd,
} from "../../lib/forms/schemas.js";

/// Form schemas (07 section 4.1): name 2 to 120, price above zero.
export const productSchema = z.object({
  name: requiredString(2, 120),
  categoryId: requiredString(1, 64),
  baseUnitId: requiredString(1, 64),
  salePriceTnd: tnd({ positive: true }),
  // Issue 008: optional; an empty field clears the cost.
  approximateCostTnd: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(tnd().nullable()),
  isStockable: z.boolean(),
  // Issue 019: bought to be resold; the form locks the stock switch on.
  isResale: z.boolean().default(false),
  code: optionalString(40),
  barcode: optionalString(64),
  notes: optionalString(500),
});
export type ProductFormInput = z.input<typeof productSchema>;
export type ProductFormOutput = z.output<typeof productSchema>;

export const conversionSchema = z.object({
  unitId: requiredString(1, 64),
  factorToBase: decimalString(6, { positive: true }),
});

export const rawMaterialSchema = z.object({
  name: requiredString(2, 120),
  baseUnitId: requiredString(1, 64),
  code: optionalString(40),
  category: optionalString(80),
  notes: optionalString(500),
  conversions: z.array(conversionSchema).default([]),
});
export type RawMaterialFormInput = z.input<typeof rawMaterialSchema>;
export type RawMaterialFormOutput = z.output<typeof rawMaterialSchema>;

export const categorySchema = z.object({
  name: requiredString(2, 80),
  description: optionalString(200),
});
export type CategoryFormInput = z.input<typeof categorySchema>;
export type CategoryFormOutput = z.output<typeof categorySchema>;

export const unitSchema = z.object({
  code: requiredString(1, 16),
  name: requiredString(2, 60),
  symbol: requiredString(1, 12),
  precision: z.coerce.number().int().min(0).max(6),
});
export type UnitFormInput = z.input<typeof unitSchema>;
export type UnitFormOutput = z.output<typeof unitSchema>;
