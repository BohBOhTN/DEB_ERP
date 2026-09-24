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
import * as api from "./customers.api.js";

export const customerKeys = {
  all: ["customers"] as const,
  list: (query: api.CustomerListQuery) => ["customers", "list", query] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
  statement: (id: string, query: api.StatementQuery) =>
    ["customers", "statement", id, query] as const,
  payments: (query: api.PaymentListQuery) =>
    ["customers", "payments", query] as const,
};

export function useCustomerBalances(query: api.CustomerListQuery) {
  return useQuery({
    queryKey: customerKeys.list(query),
    queryFn: () => api.listCustomerBalances(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCustomer(
  customerId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: customerKeys.detail(customerId),
    queryFn: () => api.getCustomer(customerId),
    enabled: options.enabled ?? customerId !== "",
    ...tier("document"),
  });
}

/// Ledger entries page by cursor; each page repeats the balances and basis.
export function useCustomerStatementPages(
  customerId: string,
  query: Pick<api.StatementQuery, "from" | "to">,
) {
  return useInfiniteQuery({
    queryKey: customerKeys.statement(customerId, query),
    queryFn: ({ pageParam }) =>
      api.getCustomerStatement(customerId, {
        ...query,
        cursor: pageParam || undefined,
      }),
    initialPageParam: "",
    enabled: customerId !== "",
    getNextPageParam: (lastPage) => lastPage?.meta?.nextCursor ?? undefined,
  });
}

export function useCustomerPayments(query: api.PaymentListQuery) {
  return useQuery({
    queryKey: customerKeys.payments(query),
    queryFn: () => api.listCustomerPayments(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCreateCustomer() {
  const invalidate = useInvalidateAfter("customer.record");
  return useMutation({ mutationFn: api.createCustomer, onSuccess: invalidate });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAfter("customer.record");
  return useMutation({
    mutationFn: (
      input: { customerId: string } & Parameters<typeof api.updateCustomer>[1],
    ) => {
      const { customerId, ...fields } = input;
      return api.updateCustomer(customerId, fields);
    },
    onSuccess: (record, input) => {
      primeDetail(queryClient, customerKeys.detail(input.customerId), record);
      return invalidate();
    },
  });
}

export function useCreateCustomerPayment() {
  const invalidate = useInvalidateAfter("customer.payment");
  return useMutation({
    mutationFn: (input: {
      body: api.CustomerPaymentInput;
      idempotencyKey: string;
    }) => api.createCustomerPayment(input.body, input.idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useReverseCustomerPayment() {
  const invalidate = useInvalidateAfter("customer.payment");
  return useMutation({
    mutationFn: (input: {
      paymentId: string;
      reason: string;
      idempotencyKey: string;
    }) =>
      api.reverseCustomerPayment(
        input.paymentId,
        input.reason,
        input.idempotencyKey,
      ),
    onSuccess: invalidate,
  });
}
