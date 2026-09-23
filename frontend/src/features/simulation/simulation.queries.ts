import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./simulation.api.js";

export const simulationKeys = {
  all: ["simulations"] as const,
  list: (query: api.SimulationListQuery) =>
    ["simulations", "list", query] as const,
  detail: (id: string) => ["simulations", "detail", id] as const,
};

export function useSimulations(query: api.SimulationListQuery) {
  return useQuery({
    queryKey: simulationKeys.list(query),
    queryFn: () => api.listSimulations(query),
    placeholderData: (previous) => previous,
  });
}

export function useSimulation(simulationId: string) {
  return useQuery({
    queryKey: simulationKeys.detail(simulationId),
    queryFn: () => api.getSimulation(simulationId),
    enabled: simulationId !== "",
  });
}

/// Simulations touch nothing else, so only their own queries refresh.
function useInvalidateSimulations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: simulationKeys.all });
}

export function useCreateSimulation() {
  const invalidate = useInvalidateSimulations();
  return useMutation({
    mutationFn: api.createSimulation,
    onSuccess: invalidate,
  });
}

export function useUpdateSimulation() {
  const invalidate = useInvalidateSimulations();
  return useMutation({
    mutationFn: (input: {
      simulationId: string;
      body: api.SimulationInput & { version: number };
    }) => api.updateSimulation(input.simulationId, input.body),
    onSuccess: invalidate,
  });
}

export function useDuplicateSimulation() {
  const invalidate = useInvalidateSimulations();
  return useMutation({
    mutationFn: (input: { simulationId: string; name?: string }) =>
      api.duplicateSimulation(input.simulationId, { name: input.name }),
    onSuccess: invalidate,
  });
}

export function useDeleteSimulation() {
  const invalidate = useInvalidateSimulations();
  return useMutation({
    mutationFn: (simulationId: string) => api.deleteSimulation(simulationId),
    onSuccess: invalidate,
  });
}
