import { useMutation, useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { useInvalidateAfter } from "../../lib/query/invalidation.js";
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
    ...tier("live"),
  });
}

export function useMovements(query: MovementListQuery) {
  return useQuery({
    queryKey: inventoryKeys.movements(query),
    queryFn: () => api.listMovements(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function usePostOpeningStock() {
  const invalidate = useInvalidateAfter("inventory.movement");
  return useMutation({
    mutationFn: (input: {
      body: api.OpeningStockInput;
      idempotencyKey: string;
    }) => api.postOpeningStock(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function usePostAdjustment() {
  const invalidate = useInvalidateAfter("inventory.movement");
  return useMutation({
    mutationFn: (input: {
      body: api.AdjustmentInput;
      idempotencyKey: string;
    }) => api.postAdjustment(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}
