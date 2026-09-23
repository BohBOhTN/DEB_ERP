import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./inventory.api.js";
import type { MovementListQuery } from "./inventory.api.js";

export const inventoryKeys = {
  all: ["inventory"] as const,
  balances: () => ["inventory", "balances"] as const,
  movements: (query: MovementListQuery) =>
    ["inventory", "movements", query] as const,
};

export function useBalances() {
  return useQuery({
    queryKey: inventoryKeys.balances(),
    queryFn: api.listBalances,
  });
}

export function useMovements(query: MovementListQuery) {
  return useQuery({
    queryKey: inventoryKeys.movements(query),
    queryFn: () => api.listMovements(query),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateInventory() {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
}

export function usePostOpeningStock() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: {
      body: api.OpeningStockInput;
      idempotencyKey: string;
    }) => api.postOpeningStock(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function usePostAdjustment() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: {
      body: api.AdjustmentInput;
      idempotencyKey: string;
    }) => api.postAdjustment(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}
