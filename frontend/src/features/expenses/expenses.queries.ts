import { useMutation, useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { useInvalidateAfter } from "../../lib/query/invalidation.js";
import * as api from "./expenses.api.js";

export const expenseKeys = {
  all: ["expenses"] as const,
  categories: (query: { isActive?: boolean }) =>
    ["expenses", "categories", query] as const,
  list: (query: api.ExpenseListQuery) => ["expenses", "list", query] as const,
  totals: (query: { from?: string; to?: string }) =>
    ["expenses", "totals", query] as const,
  detail: (id: string) => ["expenses", "detail", id] as const,
};

export function useExpenseCategories(query: { isActive?: boolean } = {}) {
  return useQuery({
    queryKey: expenseKeys.categories(query),
    queryFn: () => api.listExpenseCategories(query),
    staleTime: 60_000,
  });
}

export function useExpenses(query: api.ExpenseListQuery) {
  return useQuery({
    queryKey: expenseKeys.list(query),
    queryFn: () => api.listExpenses(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useExpenseTotals(query: { from?: string; to?: string }) {
  return useQuery({
    queryKey: expenseKeys.totals(query),
    queryFn: () => api.getExpenseTotals(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useExpense(expenseId: string) {
  return useQuery({
    queryKey: expenseKeys.detail(expenseId),
    queryFn: () => api.getExpense(expenseId),
    enabled: expenseId !== "",
    ...tier("document"),
  });
}

export function useCreateExpenseCategory() {
  const invalidate = useInvalidateAfter("expense.category");
  return useMutation({
    mutationFn: api.createExpenseCategory,
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseCategory() {
  const invalidate = useInvalidateAfter("expense.category");
  return useMutation({
    mutationFn: (
      input: { categoryId: string } & Parameters<
        typeof api.updateExpenseCategory
      >[1],
    ) => {
      const { categoryId, ...fields } = input;
      return api.updateExpenseCategory(categoryId, fields);
    },
    onSuccess: invalidate,
  });
}

export function useCreateExpense() {
  const invalidate = useInvalidateAfter("expense");
  return useMutation({ mutationFn: api.createExpense, onSuccess: invalidate });
}

export function useUpdateExpense() {
  const invalidate = useInvalidateAfter("expense");
  return useMutation({
    mutationFn: (
      input: { expenseId: string } & Parameters<typeof api.updateExpense>[1],
    ) => {
      const { expenseId, ...fields } = input;
      return api.updateExpense(expenseId, fields);
    },
    onSuccess: invalidate,
  });
}

export function usePostExpense() {
  const invalidate = useInvalidateAfter("expense");
  return useMutation({
    mutationFn: (input: { expenseId: string; version: number }) =>
      api.postExpense(input.expenseId, {
        version: input.version,
        postedAt: new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });
}

export function useCancelExpense() {
  const invalidate = useInvalidateAfter("expense");
  return useMutation({
    mutationFn: (input: {
      expenseId: string;
      version: number;
      reason: string;
    }) =>
      api.cancelExpense(input.expenseId, {
        version: input.version,
        cancelledAt: new Date().toISOString(),
        reason: input.reason,
      }),
    onSuccess: invalidate,
  });
}
