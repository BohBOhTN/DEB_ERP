import { useMutation, useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { useInvalidateAfter } from "../../lib/query/invalidation.js";
import * as api from "./orders.api.js";

export const orderKeys = {
  all: ["orders"] as const,
  list: (query: api.OrderListQuery) => ["orders", "list", query] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
};

export function useOrders(
  query: api.OrderListQuery,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: orderKeys.list(query),
    queryFn: () => api.listOrders(query),
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
    ...tier("list"),
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => api.getOrder(orderId),
    enabled: orderId !== "",
    ...tier("document"),
  });
}

export function useCreateOrder() {
  const invalidate = useInvalidateAfter("order");
  return useMutation({
    mutationFn: (input: { body: api.OrderInput; idempotencyKey: string }) =>
      api.createOrder(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useChangeOrderStatus() {
  const invalidate = useInvalidateAfter("order");
  return useMutation({
    mutationFn: (input: {
      orderId: string;
      version: number;
      status: "CONFIRMED" | "PREPARING" | "READY";
    }) =>
      api.changeOrderStatus(input.orderId, {
        version: input.version,
        status: input.status,
      }),
    onSuccess: invalidate,
  });
}

export function useRecordAdvance() {
  const invalidate = useInvalidateAfter("order");
  return useMutation({
    mutationFn: (input: {
      orderId: string;
      body: { amountTnd: string; paidAt: string; notes?: string };
      idempotencyKey: string;
    }) => api.recordAdvance(input.orderId, input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCompleteOrder() {
  const invalidate = useInvalidateAfter("order");
  return useMutation({
    mutationFn: (input: {
      orderId: string;
      body: { completedAt: string; paidAmountTnd?: string };
      idempotencyKey: string;
    }) => api.completeOrder(input.orderId, input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCancelOrder() {
  const invalidate = useInvalidateAfter("order");
  return useMutation({
    mutationFn: (input: {
      orderId: string;
      body: {
        cancelledAt: string;
        reason: string;
        advanceDisposition?: api.AdvanceDisposition;
      };
      idempotencyKey: string;
    }) => api.cancelOrder(input.orderId, input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}
