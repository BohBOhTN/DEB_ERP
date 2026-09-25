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
import * as api from "./procurement.api.js";

export const procurementKeys = {
  all: ["procurement"] as const,
  suppliers: (query: api.SupplierListQuery) =>
    ["procurement", "suppliers", query] as const,
  supplier: (id: string) => ["procurement", "supplier", id] as const,
  purchases: (query: api.PurchaseListQuery) =>
    ["procurement", "purchases", query] as const,
  purchase: (id: string) => ["procurement", "purchase", id] as const,
  statement: (id: string, query: api.StatementQuery) =>
    ["procurement", "statement", id, query] as const,
  payments: (query: api.PaymentListQuery) =>
    ["procurement", "payments", query] as const,
};

export function useSupplierBalances(query: api.SupplierListQuery) {
  return useQuery({
    queryKey: procurementKeys.suppliers(query),
    queryFn: () => api.listSupplierBalances(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useSupplier(
  supplierId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: procurementKeys.supplier(supplierId),
    queryFn: () => api.getSupplier(supplierId),
    enabled: options.enabled ?? supplierId !== "",
    ...tier("document"),
  });
}

export function usePurchases(
  query: api.PurchaseListQuery,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: procurementKeys.purchases(query),
    queryFn: () => api.listPurchases(query),
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
    ...tier("list"),
  });
}

export function usePurchase(
  purchaseId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: procurementKeys.purchase(purchaseId),
    queryFn: () => api.getPurchase(purchaseId),
    enabled: options.enabled ?? purchaseId !== "",
    ...tier("document"),
  });
}

/// Ledger entries page by cursor; each page repeats the balances and basis.
export function useSupplierStatementPages(
  supplierId: string,
  query: Pick<api.StatementQuery, "from" | "to">,
) {
  return useInfiniteQuery({
    queryKey: procurementKeys.statement(supplierId, query),
    queryFn: ({ pageParam }) =>
      api.getSupplierStatement(supplierId, {
        ...query,
        cursor: pageParam || undefined,
      }),
    initialPageParam: "",
    enabled: supplierId !== "",
    getNextPageParam: (lastPage) => lastPage?.meta?.nextCursor ?? undefined,
  });
}

export function useSupplierPayments(query: api.PaymentListQuery) {
  return useQuery({
    queryKey: procurementKeys.payments(query),
    queryFn: () => api.listSupplierPayments(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCreateSupplier() {
  const invalidate = useInvalidateAfter("procurement.supplier");
  return useMutation({ mutationFn: api.createSupplier, onSuccess: invalidate });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAfter("procurement.supplier");
  return useMutation({
    mutationFn: (
      input: { supplierId: string } & Parameters<typeof api.updateSupplier>[1],
    ) => {
      const { supplierId, ...fields } = input;
      return api.updateSupplier(supplierId, fields);
    },
    onSuccess: (record, input) => {
      primeDetail(
        queryClient,
        procurementKeys.supplier(input.supplierId),
        record,
      );
      return invalidate();
    },
  });
}

export function useSavePurchase() {
  const invalidate = useInvalidateAfter("procurement.purchase");
  return useMutation({
    mutationFn: (input: { purchaseId?: string; body: api.PurchaseInput }) =>
      input.purchaseId
        ? api.updateDraftPurchase(input.purchaseId, input.body)
        : api.createPurchase(input.body),
    onSuccess: invalidate,
  });
}

export function usePostPurchase() {
  const invalidate = useInvalidateAfter("procurement.purchase");
  return useMutation({
    mutationFn: (input: { purchaseId: string; idempotencyKey: string }) =>
      api.postPurchase(input.purchaseId, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCancelPurchase() {
  const invalidate = useInvalidateAfter("procurement.purchase");
  return useMutation({
    mutationFn: (input: {
      purchaseId: string;
      reason: string;
      idempotencyKey: string;
    }) =>
      api.cancelPurchase(input.purchaseId, input.reason, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useCreateSupplierPayment() {
  const invalidate = useInvalidateAfter("procurement.payment");
  return useMutation({
    mutationFn: (input: {
      body: api.SupplierPaymentInput;
      idempotencyKey: string;
    }) => api.createSupplierPayment(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useReverseSupplierPayment() {
  const invalidate = useInvalidateAfter("procurement.payment");
  return useMutation({
    mutationFn: (input: {
      paymentId: string;
      reason: string;
      idempotencyKey: string;
    }) =>
      api.reverseSupplierPayment(
        input.paymentId,
        input.reason,
        input.idempotencyKey,
      ),
    onSuccess: invalidate,
  });
}
