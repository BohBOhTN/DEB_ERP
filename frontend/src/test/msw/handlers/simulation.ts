import Decimal from "decimal.js-light";
import { http } from "msw";
import type {
  CostSimulation,
  SimulationInput,
} from "../../../features/simulation/simulation.api.js";
import { kg, piece, sac } from "../../factories/catalog.js";
import { makePage } from "../../factories/page.js";
import { makeSimulation } from "../../factories/simulation.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// In-memory cost simulations computing the documented formulas.
export interface SimulationStore {
  simulations: CostSimulation[];
}

export function makeSimulationStore(
  overrides: Partial<SimulationStore> = {},
): SimulationStore {
  return {
    simulations: [makeSimulation({ id: "sim-1", name: "Baguette tradition" })],
    ...overrides,
  };
}

let sequence = 100;
const units = [kg, piece, sac];

function compute(
  id: string,
  input: SimulationInput,
  version: number,
  createdAt: string,
): CostSimulation {
  const ingredients = input.ingredients.map((line, index) => {
    const entered = units.find((unit) => unit.id === line.enteredUnitId) ?? kg;
    const basis =
      units.find((unit) => unit.id === line.priceBasisUnitId) ?? entered;
    const factor = new Decimal(
      line.enteredUnitId === line.priceBasisUnitId
        ? 1
        : (line.conversionFactorToBase ??
            (line.enteredUnitId === sac.id ? 50 : 1)),
    );
    const base = new Decimal(line.enteredQuantity).times(factor);
    return {
      id: `ingr-${sequence}-${index}`,
      rawMaterialId: line.rawMaterialId ?? null,
      ingredientName:
        line.ingredientName ??
        (line.rawMaterialId === "raw-1" ? "Farine T55" : "Ingrédient"),
      enteredQuantity: new Decimal(line.enteredQuantity).toFixed(6),
      enteredUnitId: entered.id,
      conversionFactorToBase: factor.toFixed(6),
      baseQuantity: base.toFixed(6),
      unitPriceTnd: new Decimal(line.unitPriceTnd).toFixed(3),
      priceBasisUnitId: basis.id,
      lineCostTnd: base.times(line.unitPriceTnd).toDecimalPlaces(3).toFixed(3),
      enteredUnitNameSnapshot: entered.name,
      priceBasisUnitNameSnapshot: basis.name,
      position: index,
    };
  });
  const total = ingredients
    .reduce((sum, line) => sum.plus(line.lineCostTnd), new Decimal(0))
    .toDecimalPlaces(3);
  const outputUnit =
    units.find((unit) => unit.id === input.outputUnitId) ?? piece;
  return makeSimulation({
    id,
    name: input.name,
    targetProductId: input.targetProductId ?? null,
    targetProductNameSnapshot: input.targetProductId ? "Pain complet" : null,
    outputQuantity: new Decimal(input.outputQuantity).toFixed(6),
    outputUnitId: outputUnit.id,
    outputUnitNameSnapshot: outputUnit.name,
    outputUnit,
    notes: input.notes ?? null,
    totalIngredientCostTnd: total.toFixed(3),
    costPerOutputUnitTnd: total
      .dividedBy(input.outputQuantity)
      .toDecimalPlaces(3)
      .toFixed(3),
    version,
    createdAt,
    updatedAt: new Date().toISOString(),
    ingredients,
  });
}

export function simulationHandlers(
  store: SimulationStore = makeSimulationStore(),
) {
  return [
    http.get(`${apiV1}/cost-simulations`, () =>
      ok(makePage(store.simulations)),
    ),
    http.post(`${apiV1}/cost-simulations`, async ({ request }) => {
      const body = (await request.json()) as SimulationInput;
      if (!body.ingredients?.length)
        return apiError(
          400,
          "SIMULATION_INGREDIENTS_REQUIRED",
          "Ajoutez au moins un ingrédient.",
        );
      sequence += 1;
      const simulation = compute(
        `sim-${sequence}`,
        body,
        1,
        new Date().toISOString(),
      );
      store.simulations.unshift(simulation);
      return ok({ simulation }, 201);
    }),
    http.get(`${apiV1}/cost-simulations/:id`, ({ params }) => {
      const simulation = store.simulations.find((row) => row.id === params.id);
      return simulation
        ? ok({ simulation })
        : apiError(404, "SIMULATION_NOT_FOUND", "Simulation introuvable.");
    }),
    http.patch(`${apiV1}/cost-simulations/:id`, async ({ params, request }) => {
      const body = (await request.json()) as SimulationInput & {
        version: number;
      };
      const index = store.simulations.findIndex((row) => row.id === params.id);
      const existing = store.simulations[index];
      if (!existing)
        return apiError(404, "SIMULATION_NOT_FOUND", "Simulation introuvable.");
      if (body.version !== existing.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette simulation a été modifiée. Rechargez puis réessayez.",
        );
      sequence += 1;
      store.simulations[index] = compute(
        existing.id,
        body,
        existing.version + 1,
        existing.createdAt,
      );
      return ok({ simulation: store.simulations[index] });
    }),
    http.post(
      `${apiV1}/cost-simulations/:id/duplicate`,
      async ({ params, request }) => {
        const body = (await request.json()) as { name?: string };
        const existing = store.simulations.find((row) => row.id === params.id);
        if (!existing)
          return apiError(
            404,
            "SIMULATION_NOT_FOUND",
            "Simulation introuvable.",
          );
        sequence += 1;
        const copy = {
          ...existing,
          id: `sim-${sequence}`,
          name: body.name ?? `${existing.name} (copie)`,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.simulations.unshift(copy);
        return ok({ simulation: copy }, 201);
      },
    ),
    http.delete(`${apiV1}/cost-simulations/:id`, ({ params }) => {
      const index = store.simulations.findIndex((row) => row.id === params.id);
      if (index < 0)
        return apiError(404, "SIMULATION_NOT_FOUND", "Simulation introuvable.");
      store.simulations.splice(index, 1);
      return ok({ deleted: true });
    }),
  ];
}
