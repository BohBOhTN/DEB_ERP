import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page } from "../catalog/catalogApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export interface SimulationIngredient {
  id: string;
  rawMaterialId: string | null;
  ingredientName: string;
  enteredQuantity: string;
  conversionFactorToBase: string;
  baseQuantity: string;
  unitPriceTnd: string;
  lineCostTnd: string;
  enteredUnitNameSnapshot: string;
  priceBasisUnitNameSnapshot: string;
}

export interface CostSimulation {
  id: string;
  name: string;
  targetProductId: string | null;
  targetProductNameSnapshot: string | null;
  outputQuantity: string;
  outputUnitNameSnapshot: string;
  notes: string | null;
  totalIngredientCostTnd: string;
  costPerOutputUnitTnd: string;
  version: number;
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

export async function getSimulations(): Promise<Page<CostSimulation>> {
  return getKeyed("/cost-simulations", "simulations");
}

export async function getSimulation(
  simulationId: string,
): Promise<CostSimulation> {
  return getKeyed(`/cost-simulations/${simulationId}`, "simulation");
}

export async function createSimulation(
  params: SimulationInput,
): Promise<CostSimulation> {
  return postKeyed("/cost-simulations", params, "simulation");
}

export async function duplicateSimulation(
  simulationId: string,
): Promise<CostSimulation> {
  return postKeyed(
    `/cost-simulations/${simulationId}/duplicate`,
    {},
    "simulation",
  );
}

export async function updateSimulation(
  simulationId: string,
  params: SimulationInput & { version: number },
): Promise<CostSimulation> {
  const response = await fetch(
    `${apiBaseUrl}/cost-simulations/${simulationId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    simulation: CostSimulation;
  }>;
  return body.data.simulation;
}

export async function deleteSimulation(simulationId: string): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/cost-simulations/${simulationId}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }
}

async function getKeyed<TResult>(path: string, key: string): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}

async function postKeyed<TResult>(
  path: string,
  payload: unknown,
  key: string,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}
