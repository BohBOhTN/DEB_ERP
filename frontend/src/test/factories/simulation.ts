import type {
  CostSimulation,
  SimulationIngredient,
} from "../../features/simulation/simulation.api.js";
import { kg, piece } from "./catalog.js";

let sequence = 0;
const next = () => (sequence += 1);

export function makeIngredient(
  overrides: Partial<SimulationIngredient> = {},
): SimulationIngredient {
  const n = next();
  return {
    id: `ingr-${n}`,
    rawMaterialId: "raw-1",
    ingredientName: "Farine T55",
    enteredQuantity: "3.000000",
    enteredUnitId: kg.id,
    conversionFactorToBase: "1.000000",
    baseQuantity: "3.000000",
    unitPriceTnd: "1.800",
    priceBasisUnitId: kg.id,
    lineCostTnd: "5.400",
    enteredUnitNameSnapshot: kg.name,
    priceBasisUnitNameSnapshot: kg.name,
    position: 0,
    ...overrides,
  };
}

export function makeSimulation(
  overrides: Partial<CostSimulation> = {},
): CostSimulation {
  const n = next();
  return {
    id: `sim-${n}`,
    name: `Baguette tradition ${n}`,
    targetProductId: null,
    targetProductNameSnapshot: null,
    outputQuantity: "50.000000",
    outputUnitId: piece.id,
    outputUnitNameSnapshot: piece.name,
    notes: null,
    totalIngredientCostTnd: "6.350",
    costPerOutputUnitTnd: "0.127",
    version: 1,
    createdAt: "2026-09-20T08:00:00.000Z",
    updatedAt: "2026-09-21T08:00:00.000Z",
    targetProduct: null,
    outputUnit: piece,
    ingredients: [
      makeIngredient(),
      makeIngredient({
        rawMaterialId: null,
        ingredientName: "Levure",
        enteredQuantity: "0.100000",
        baseQuantity: "0.100000",
        unitPriceTnd: "9.000",
        lineCostTnd: "0.900",
        position: 1,
      }),
      makeIngredient({
        rawMaterialId: null,
        ingredientName: "Sel",
        enteredQuantity: "0.050000",
        baseQuantity: "0.050000",
        unitPriceTnd: "1.000",
        lineCostTnd: "0.050",
        position: 2,
      }),
    ],
    ...overrides,
  };
}
