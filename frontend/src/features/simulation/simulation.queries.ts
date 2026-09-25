import { useMutation, useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { useInvalidateAfter } from "../../lib/query/invalidation.js";
import * as api from "./simulation.api.js";

export const simulationKeys = {
  all: ["simulations"] as const,
  list: (query: api.SimulationListQuery) =>
    ["simulations", "list", query] as const,
  detail: (id: string) => ["simulations", "detail", id] as const,
};

export function useSimulations(query: api.SimulationListQuery, enabled = true) {
  return useQuery({
    enabled,
    queryKey: simulationKeys.list(query),
    queryFn: () => api.listSimulations(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useSimulation(simulationId: string) {
  return useQuery({
    queryKey: simulationKeys.detail(simulationId),
    queryFn: () => api.getSimulation(simulationId),
    enabled: simulationId !== "",
    ...tier("document"),
  });
}

export function useCreateSimulation() {
  const invalidate = useInvalidateAfter("simulation");
  return useMutation({
    mutationFn: api.createSimulation,
    onSuccess: invalidate,
  });
}

export function useUpdateSimulation() {
  const invalidate = useInvalidateAfter("simulation");
  return useMutation({
    mutationFn: (input: {
      simulationId: string;
      body: api.SimulationInput & { version: number };
    }) => api.updateSimulation(input.simulationId, input.body),
    onSuccess: invalidate,
  });
}

export function useDuplicateSimulation() {
  const invalidate = useInvalidateAfter("simulation");
  return useMutation({
    mutationFn: (input: { simulationId: string; name?: string }) =>
      api.duplicateSimulation(input.simulationId, { name: input.name }),
    onSuccess: invalidate,
  });
}

export function useDeleteSimulation() {
  const invalidate = useInvalidateAfter("simulation");
  return useMutation({
    mutationFn: (simulationId: string) => api.deleteSimulation(simulationId),
    onSuccess: invalidate,
  });
}
