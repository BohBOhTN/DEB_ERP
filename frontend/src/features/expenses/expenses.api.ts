import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1` expenses (UI-17). Commands carry the record's `version`; a
/// cancelled expense stays in history and leaves every active total
/// (EXP-007, EXP-008).
export type ExpenseStatus = "DRAFT" | "POSTED" | "CANCELLED";

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
  expenseCount?: number;
}

export interface Expense {
  id: string;
  reference: string;
  categoryId: string;
  status: ExpenseStatus;
  expenseDate: string;
  amountTnd: string;
  description: string;
  externalReference: string | null;
  method: "CASH";
  notes: string | null;
  responsibleUserId: string;
  postedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  version: number;
  createdAt: string;
  category: ExpenseCategory;
}

export interface ExpenseTotals {
  totalTnd: string;
  postedCount: number;
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    totalTnd: string;
  }>;
  byDate: Array<{ day: string; totalTnd: string }>;
  range: { from: string | null; to: string };
}

export async function listExpenseCategories(
  query: { isActive?: boolean } = {},
): Promise<ExpenseCategory[]> {
  return (
    await apiClient.get<{ expenseCategories: ExpenseCategory[] }>(
      "/expense-categories",
      {
        query:
          query.isActive === undefined
            ? undefined
            : { isActive: query.isActive },
      },
    )
  ).expenseCategories;
}

export async function createExpenseCategory(input: {
  name: string;
  description?: string;
}): Promise<ExpenseCategory> {
  return (
    await apiClient.post<{ expenseCategory: ExpenseCategory }>(
      "/expense-categories",
      input,
    )
  ).expenseCategory;
}

export async function updateExpenseCategory(
  categoryId: string,
  input: {
    version: number;
    name?: string;
    description?: string;
    isActive?: boolean;
  },
): Promise<ExpenseCategory> {
  return (
    await apiClient.patch<{ expenseCategory: ExpenseCategory }>(
      `/expense-categories/${categoryId}`,
      input,
    )
  ).expenseCategory;
}

export interface ExpenseListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  categoryId?: string;
  status?: ExpenseStatus;
  from?: string;
  to?: string;
}

export function listExpenses(
  query: ExpenseListQuery,
): Promise<PageResult<Expense>> {
  return apiClient.list<Expense>("/expenses", {
    query: toSearchParams({ ...query }),
  });
}

export async function getExpenseTotals(
  query: { from?: string; to?: string } = {},
): Promise<ExpenseTotals> {
  return (
    await apiClient.get<{ expenseTotals: ExpenseTotals }>("/expense-totals", {
      query: toSearchParams({ page: 1, pageSize: 1, ...query } as never),
    })
  ).expenseTotals;
}

export async function getExpense(expenseId: string): Promise<Expense> {
  return (await apiClient.get<{ expense: Expense }>(`/expenses/${expenseId}`))
    .expense;
}

export interface ExpenseInput {
  categoryId: string;
  expenseDate: string;
  amountTnd: string;
  description: string;
  externalReference?: string;
  notes?: string;
  post?: boolean;
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  return (await apiClient.post<{ expense: Expense }>("/expenses", input))
    .expense;
}

export async function updateExpense(
  expenseId: string,
  input: Partial<Omit<ExpenseInput, "post">> & { version: number },
): Promise<Expense> {
  return (
    await apiClient.patch<{ expense: Expense }>(`/expenses/${expenseId}`, input)
  ).expense;
}

export async function postExpense(
  expenseId: string,
  input: { version: number; postedAt: string },
): Promise<Expense> {
  return (
    await apiClient.post<{ expense: Expense }>(
      `/expenses/${expenseId}/post`,
      input,
    )
  ).expense;
}

export async function cancelExpense(
  expenseId: string,
  input: { version: number; cancelledAt: string; reason: string },
): Promise<Expense> {
  return (
    await apiClient.post<{ expense: Expense }>(
      `/expenses/${expenseId}/cancel`,
      input,
    )
  ).expense;
}
