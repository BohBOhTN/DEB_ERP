import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./pos.api.js";

export const posKeys = {
  all: ["pos"] as const,
  session: ["pos", "session"] as const,
  sales: (query: api.SaleListQuery) => ["pos", "sales", query] as const,
  sale: (id: string) => ["pos", "sale", id] as const,
  sessions: (query: api.SessionListQuery) =>
    ["pos", "sessions", query] as const,
  sessionDetail: (id: string) => ["pos", "sessionDetail", id] as const,
};

/// Whether a till is open decides what the POS, the orders and the customer
/// payments may do right now (07 sections 4.4 to 4.6).
export function useCurrentSession(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: posKeys.session,
    queryFn: api.getCurrentSession,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useSales(query: api.SaleListQuery) {
  return useQuery({
    queryKey: posKeys.sales(query),
    queryFn: () => api.listSales(query),
    placeholderData: (previous) => previous,
  });
}

export function useSale(saleId: string) {
  return useQuery({
    queryKey: posKeys.sale(saleId),
    queryFn: () => api.getSale(saleId),
    enabled: saleId !== "",
  });
}

export function useSessions(query: api.SessionListQuery) {
  return useQuery({
    queryKey: posKeys.sessions(query),
    queryFn: () => api.listSessions(query),
    placeholderData: (previous) => previous,
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
  });
}

/// A sale moves stock, revenue and customer receivables; a session change
/// changes what every other module may do with cash.
function useInvalidatePos() {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: posKeys.all });
    await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    await queryClient.invalidateQueries({ queryKey: ["customers"] });
    await queryClient.invalidateQueries({ queryKey: ["orders"] });
    await queryClient.invalidateQueries({ queryKey: ["home"] });
  };
}

export function useOpenSession() {
  const invalidate = useInvalidatePos();
  return useMutation({
    mutationFn: (input: {
      body: { openingCashTnd: string; notes?: string };
      idempotencyKey: string;
    }) => api.openSession(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCloseSession() {
  const invalidate = useInvalidatePos();
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
  const invalidate = useInvalidatePos();
  return useMutation({
    mutationFn: (input: { body: api.SaleInput; idempotencyKey: string }) =>
      api.postSale(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}
