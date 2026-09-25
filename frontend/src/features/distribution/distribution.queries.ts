import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import {
  primeDetail,
  useInvalidateAfter,
} from "../../lib/query/invalidation.js";
import * as api from "./distribution.api.js";

export const distributionKeys = {
  all: ["distribution"] as const,
  distributors: (query: api.DistributorListQuery) =>
    ["distribution", "distributors", query] as const,
  distributor: (id: string) => ["distribution", "distributor", id] as const,
  dispatches: (query: api.DispatchListQuery) =>
    ["distribution", "dispatches", query] as const,
  dispatch: (id: string) => ["distribution", "dispatch", id] as const,
  settlements: (query: api.SettlementListQuery) =>
    ["distribution", "settlements", query] as const,
  custody: (distributorId?: string) =>
    ["distribution", "custody", distributorId ?? ""] as const,
  balances: (query: api.BalanceListQuery) =>
    ["distribution", "balances", query] as const,
  statement: (id: string, query: api.StatementQuery) =>
    ["distribution", "statement", id, query] as const,
  payments: (query: api.PaymentListQuery) =>
    ["distribution", "payments", query] as const,
};

export function useDistributors(query: api.DistributorListQuery) {
  return useQuery({
    queryKey: distributionKeys.distributors(query),
    queryFn: () => api.listDistributors(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useDistributor(distributorId: string) {
  return useQuery({
    queryKey: distributionKeys.distributor(distributorId),
    queryFn: () => api.getDistributor(distributorId),
    enabled: distributorId !== "",
    ...tier("document"),
  });
}

export function useDispatches(query: api.DispatchListQuery) {
  return useQuery({
    queryKey: distributionKeys.dispatches(query),
    queryFn: () => api.listDispatches(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useDispatch(dispatchId: string) {
  return useQuery({
    queryKey: distributionKeys.dispatch(dispatchId),
    queryFn: () => api.getDispatch(dispatchId),
    enabled: dispatchId !== "",
    ...tier("document"),
  });
}

export function useSettlements(query: api.SettlementListQuery) {
  return useQuery({
    queryKey: distributionKeys.settlements(query),
    queryFn: () => api.listSettlements(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCustody(distributorId?: string) {
  return useQuery({
    queryKey: distributionKeys.custody(distributorId),
    queryFn: () => api.getCustody(distributorId),
    ...tier("live"),
  });
}

export function useDistributorBalances(query: api.BalanceListQuery) {
  return useQuery({
    queryKey: distributionKeys.balances(query),
    queryFn: () => api.listDistributorBalances(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

/// Ledger entries page by cursor; each page repeats the balances and basis.
export function useDistributorStatementPages(
  distributorId: string,
  query: Pick<api.StatementQuery, "from" | "to">,
) {
  return useInfiniteQuery({
    queryKey: distributionKeys.statement(distributorId, query),
    queryFn: ({ pageParam }) =>
      api.getDistributorStatement(distributorId, {
        ...query,
        cursor: pageParam || undefined,
      }),
    initialPageParam: "",
    enabled: distributorId !== "",
    getNextPageParam: (lastPage) => lastPage?.meta?.nextCursor ?? undefined,
  });
}

export function useDistributorPayments(query: api.PaymentListQuery) {
  return useQuery({
    queryKey: distributionKeys.payments(query),
    queryFn: () => api.listDistributorPayments(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCreateDistributor() {
  const invalidate = useInvalidateAfter("distribution.distributor");
  return useMutation({
    mutationFn: api.createDistributor,
    onSuccess: invalidate,
  });
}

export function useUpdateDistributor() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAfter("distribution.distributor");
  return useMutation({
    mutationFn: (
      input: { distributorId: string } & Parameters<
        typeof api.updateDistributor
      >[1],
    ) => {
      const { distributorId, ...fields } = input;
      return api.updateDistributor(distributorId, fields);
    },
    onSuccess: (record, input) => {
      primeDetail(
        queryClient,
        distributionKeys.distributor(input.distributorId),
        record,
      );
      return invalidate();
    },
  });
}

export function usePostDirectSale() {
  const invalidate = useInvalidateAfter("distribution.sale");
  return useMutation({
    mutationFn: (input: {
      body: api.DirectSaleInput;
      idempotencyKey: string;
    }) => api.postDirectSale(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function usePostDispatch() {
  const invalidate = useInvalidateAfter("distribution.dispatch");
  return useMutation({
    mutationFn: (input: { body: api.DispatchInput; idempotencyKey: string }) =>
      api.postDispatch(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function usePostSettlement() {
  const invalidate = useInvalidateAfter("distribution.settlement");
  return useMutation({
    mutationFn: (input: {
      body: api.SettlementInput;
      idempotencyKey: string;
    }) => api.postSettlement(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCreateDistributorPayment() {
  const invalidate = useInvalidateAfter("distribution.payment");
  return useMutation({
    mutationFn: (input: {
      body: api.DistributorPaymentInput;
      idempotencyKey: string;
    }) => api.createDistributorPayment(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useReverseDistributorPayment() {
  const invalidate = useInvalidateAfter("distribution.payment");
  return useMutation({
    mutationFn: (input: {
      paymentId: string;
      reason: string;
      idempotencyKey: string;
    }) =>
      api.reverseDistributorPayment(
        input.paymentId,
        input.reason,
        input.idempotencyKey,
      ),
    onSuccess: invalidate,
  });
}
