import Decimal from "decimal.js-light";
import { z } from "zod";
import {
  decimalString,
  optionalString,
  requiredString,
} from "../../lib/forms/schemas.js";
import type { RawMaterial } from "../catalog/catalog.api.js";

/// One ingredient line of the editor: a catalogue raw material (units from
/// its conversions, price per base unit) or a free-text ingredient (one
/// unit for quantity and price, factor 1). Everything entered is
/// snapshotted by the server (SIM-004, SIM-006).
export interface IngredientLineValues {
  key: string;
  mode: "RAW" | "FREE";
  rawMaterial: RawMaterial | null;
  ingredientName: string;
  enteredQuantity: string;
  enteredUnitId: string;
  unitPriceTnd: string;
  priceBasisUnitId: string;
  factorToBase: string;
}

const money = /^\d+([.,]\d{1,3})?$/;

export const simulationSchema = z.object({
  name: requiredString(2, 120),
  targetProductId: z.string().default(""),
  outputQuantity: decimalString(3, { positive: true }),
  outputUnitId: z.string().min(1, "Choisissez l'unité produite."),
  notes: optionalString(500),
  ingredients: z
    .array(
      z
        .object({
          key: z.string(),
          mode: z.enum(["RAW", "FREE"]),
          rawMaterial: z.custom<RawMaterial | null>(() => true),
          ingredientName: z.string(),
          enteredQuantity: decimalString(6, { positive: true }),
          enteredUnitId: z.string().min(1, "Choisissez une unité."),
          unitPriceTnd: z
            .string()
            .regex(money, "Saisissez un prix avec au plus 3 décimales."),
          priceBasisUnitId: z.string(),
          factorToBase: z.string().default("1"),
        })
        .superRefine((line, context) => {
          if (line.mode === "RAW" && !line.rawMaterial) {
            context.addIssue({
              code: "custom",
              path: ["ingredientName"],
              message: "Choisissez une matière première.",
            });
          }
          if (line.mode === "FREE" && line.ingredientName.trim().length < 2) {
            context.addIssue({
              code: "custom",
              path: ["ingredientName"],
              message: "Nommez l'ingrédient.",
            });
          }
        }),
    )
    .min(1, "Ajoutez au moins un ingrédient."),
});
export type SimulationFormInput = z.input<typeof simulationSchema>;
export type SimulationFormOutput = z.output<typeof simulationSchema>;

export function safeDecimal(
  value: string | number | null | undefined,
): Decimal {
  try {
    return new Decimal(String(value ?? "").replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}

/// Section 16.3: base quantity = entered × factor; line cost = base × price.
export function ingredientLineCost(
  line: Pick<
    IngredientLineValues,
    "enteredQuantity" | "factorToBase" | "unitPriceTnd"
  >,
): Decimal {
  return safeDecimal(line.enteredQuantity)
    .times(safeDecimal(line.factorToBase || 1))
    .times(safeDecimal(line.unitPriceTnd))
    .toDecimalPlaces(3);
}

export function simulationTotals(
  lines: Array<
    Pick<
      IngredientLineValues,
      "enteredQuantity" | "factorToBase" | "unitPriceTnd"
    >
  >,
  outputQuantity: string,
) {
  const total = lines
    .reduce((sum, line) => sum.plus(ingredientLineCost(line)), new Decimal(0))
    .toDecimalPlaces(3);
  const output = safeDecimal(outputQuantity);
  const perUnit = output.greaterThan(0)
    ? total.dividedBy(output).toDecimalPlaces(3)
    : new Decimal(0);
  return { total, perUnit };
}
