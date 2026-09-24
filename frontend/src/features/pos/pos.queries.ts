import { useMutation, useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { useInvalidateAfter } from "../../lib/query/invalidation.js";
import * as api from "./pos.api.js";

export const posKeys = {
  all: ["pos"] as const,
  session: ["pos", "session"] as const,
  sales: (query: api.SaleListQuery) => ["pos", "sales", query] as const,
  salesSummary: (query: api.SaleFilterQuery) =>
    ["pos", "sales", "summary", query] as const,
  sale: (id: string) => ["pos", "sale", id] as const,
  sessions: (query: api.SessionListQuery) =>
    ["pos", "sessions", query] as const,
  sessionDetail: (id: string) => ["pos", "sessionDetail", id] as const,
  products: (q: string) => ["pos", "products", q] as const,
};

/// Whether a till is open decides what the POS, the orders and the customer
/// payments may do right now (07 sections 4.4 to 4.6).
export function useCurrentSession(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: posKeys.session,
    queryFn: api.getCurrentSession,
    enabled: options.enabled ?? true,
    ...tier("live"),
  });
}

export function useSales(query: api.SaleListQuery) {
  return useQuery({
    queryKey: posKeys.sales(query),
    queryFn: () => api.listSales(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useSalesSummary(query: api.SaleFilterQuery) {
  return useQuery({
    queryKey: posKeys.salesSummary(query),
    queryFn: () => api.getSalesSummary(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCancelSale() {
  const invalidate = useInvalidateAfter("pos.sale");
  return useMutation({
    mutationFn: (input: {
      saleId: string;
      reason: string;
      idempotencyKey: string;
    }) => api.cancelSale(input.saleId, input.reason, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useSale(saleId: string) {
  return useQuery({
    queryKey: posKeys.sale(saleId),
    queryFn: () => api.getSale(saleId),
    enabled: saleId !== "",
    ...tier("document"),
  });
}

export function useSessions(query: api.SessionListQuery) {
  return useQuery({
    queryKey: posKeys.sessions(query),
    queryFn: () => api.listSessions(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useSessionDetail(
  sessionId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: posKeys.sessionDetail(sessionId),
    queryFn: () => api.getSession(sessionId),
    enabled: options.enabled ?? sessionId !== "",
    ...tier("document"),
  });
}

export function useOpenSession() {
  const invalidate = useInvalidateAfter("pos.session");
  return useMutation({
    mutationFn: (input: {
      body: { openingCashTnd: string; notes?: string };
      idempotencyKey: string;
    }) => api.openSession(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCloseSession() {
  const invalidate = useInvalidateAfter("pos.session");
  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      body: { countedCashTnd: string; notes?: string };
      idempotencyKey: string;
    }) => api.closeSession(input.sessionId, input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function usePostSale() {
  const invalidate = useInvalidateAfter("pos.sale");
  return useMutation({
    mutationFn: (input: { body: api.SaleInput; idempotencyKey: string }) =>
      api.postSale(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}
