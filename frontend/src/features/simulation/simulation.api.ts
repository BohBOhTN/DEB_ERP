import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";
import type { Product, Unit } from "../catalog/catalog.api.js";

/// `/api/v1/cost-simulations` (UI-18). A simulation is a planning document:
/// it snapshots what was entered and touches no stock or ledger (SIM-003,
/// SIM-006).
export interface SimulationIngredient {
  id: string;
  rawMaterialId: string | null;
  ingredientName: string;
  enteredQuantity: string;
  enteredUnitId: string;
  conversionFactorToBase: string;
  baseQuantity: string;
  unitPriceTnd: string;
  priceBasisUnitId: string;
  lineCostTnd: string;
  enteredUnitNameSnapshot: string;
  priceBasisUnitNameSnapshot: string;
  position: number;
}

export interface CostSimulation {
  id: string;
  name: string;
  targetProductId: string | null;
  targetProductNameSnapshot: string | null;
  outputQuantity: string;
  outputUnitId: string;
  outputUnitNameSnapshot: string;
  notes: string | null;
  totalIngredientCostTnd: string;
  costPerOutputUnitTnd: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  targetProduct: Product | null;
  outputUnit: Unit;
  ingredients: SimulationIngredient[];
}

export interface SimulationIngredientInput {
  rawMaterialId?: string;
  ingredientName?: string;
  enteredQuantity: string;
  enteredUnitId: string;
  unitPriceTnd: string;
  priceBasisUnitId: string;
  conversionFactorToBase?: string;
}

export interface SimulationInput {
  name: string;
  targetProductId?: string;
  outputQuantity: string;
  outputUnitId: string;
  notes?: string;
  ingredients: SimulationIngredientInput[];
}

export interface SimulationListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  targetProductId?: string;
}

export function listSimulations(
  query: SimulationListQuery,
): Promise<PageResult<CostSimulation>> {
  return apiClient.list<CostSimulation>("/cost-simulations", {
    query: toSearchParams({ ...query }),
  });
}

export async function getSimulation(
  simulationId: string,
): Promise<CostSimulation> {
  return (
    await apiClient.get<{ simulation: CostSimulation }>(
      `/cost-simulations/${simulationId}`,
    )
  ).simulation;
}

export async function createSimulation(
  input: SimulationInput,
): Promise<CostSimulation> {
  return (
    await apiClient.post<{ simulation: CostSimulation }>(
      "/cost-simulations",
      input,
    )
  ).simulation;
}

export async function updateSimulation(
  simulationId: string,
  input: SimulationInput & { version: number },
): Promise<CostSimulation> {
  return (
    await apiClient.patch<{ simulation: CostSimulation }>(
      `/cost-simulations/${simulationId}`,
      input,
    )
  ).simulation;
}

export async function duplicateSimulation(
  simulationId: string,
  input: { name?: string } = {},
): Promise<CostSimulation> {
  return (
    await apiClient.post<{ simulation: CostSimulation }>(
      `/cost-simulations/${simulationId}/duplicate`,
      input,
    )
  ).simulation;
}

export async function deleteSimulation(simulationId: string): Promise<void> {
  await apiClient.delete<{ deleted: boolean }>(
    `/cost-simulations/${simulationId}`,
  );
}
