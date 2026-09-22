import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page } from "../catalog/catalogApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export type ExpenseStatus = "DRAFT" | "POSTED" | "CANCELLED";

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  DRAFT: "Brouillon",
  POSTED: "Validee",
  CANCELLED: "Annulee",
};

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
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
  notes: string | null;
  cancellationReason: string | null;
  version: number;
  category?: ExpenseCategory;
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
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  return getKeyed("/expense-categories", "expenseCategories");
}

export async function createExpenseCategory(params: {
  name: string;
  description?: string;
}): Promise<ExpenseCategory> {
  return postKeyed("/expense-categories", params, "expenseCategory");
}

export async function updateExpenseCategory(
  categoryId: string,
  params: { version: number; name?: string; isActive?: boolean },
): Promise<ExpenseCategory> {
  const response = await fetch(
    `${apiBaseUrl}/expense-categories/${categoryId}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    expenseCategory: ExpenseCategory;
  }>;
  return body.data.expenseCategory;
}

export async function getExpenses(params?: {
  status?: ExpenseStatus;
  categoryId?: string;
}): Promise<Page<Expense>> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set("status", params.status);
  }

  if (params?.categoryId) {
    query.set("categoryId", params.categoryId);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return getKeyed(`/expenses${suffix}`, "expenses");
}

export async function getExpenseTotals(): Promise<ExpenseTotals> {
  return getKeyed("/expense-totals", "expenseTotals");
}

export async function createExpense(params: {
  categoryId: string;
  expenseDate: string;
  amountTnd: string;
  description: string;
  externalReference?: string;
  notes?: string;
  post?: boolean;
}): Promise<Expense> {
  return postKeyed("/expenses", params, "expense");
}

export async function postExpense(
  expenseId: string,
  params: { version: number; postedAt: string },
): Promise<Expense> {
  return postKeyed(`/expenses/${expenseId}/post`, params, "expense");
}

export async function cancelExpense(
  expenseId: string,
  params: { version: number; cancelledAt: string; reason: string },
): Promise<Expense> {
  return postKeyed(`/expenses/${expenseId}/cancel`, params, "expense");
}

async function getKeyed<TResult>(path: string, key: string): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}

async function postKeyed<TResult>(
  path: string,
  payload: unknown,
  key: string,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}
