import Decimal from "decimal.js-light";
import { http } from "msw";
import type {
  Expense,
  ExpenseCategory,
  ExpenseInput,
} from "../../../features/expenses/expenses.api.js";
import {
  electricity,
  makeExpense,
  makeExpenseCategory,
  packaging,
  rent,
  supplies,
} from "../../factories/expenses.js";
import { makePage } from "../../factories/page.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// In-memory expenses: totals read posted expenses only, bucketed by day,
/// as the release gate requires (AS-017, AS-V2-21).
export interface ExpensesStore {
  categories: ExpenseCategory[];
  expenses: Expense[];
}

export function makeExpensesStore(
  overrides: Partial<ExpensesStore> = {},
): ExpensesStore {
  return {
    categories: [electricity, rent, supplies, packaging],
    expenses: [
      makeExpense({
        id: "expense-1",
        reference: "DEP-000001",
        category: electricity,
        categoryId: electricity.id,
        amountTnd: "120.000",
        expenseDate: "2026-09-10T10:00:00.000Z",
      }),
      makeExpense({
        id: "expense-2",
        reference: "DEP-000002",
        category: rent,
        categoryId: rent.id,
        amountTnd: "800.000",
        description: "Loyer septembre",
        expenseDate: "2026-09-02T09:00:00.000Z",
      }),
      makeExpense({
        id: "expense-3",
        reference: "DEP-000003",
        category: electricity,
        categoryId: electricity.id,
        status: "DRAFT",
        postedAt: null,
        amountTnd: "45.500",
        description: "Ampoules",
        expenseDate: "2026-09-15T11:00:00.000Z",
      }),
    ],
    ...overrides,
  };
}

let sequence = 100;
const day = (value: string) => value.slice(0, 10);

/// The tree the server answers (issue 018): parents first, children right
/// under them, with their depth and path.
export function categoryTree(
  categories: ExpenseCategory[],
  isActive?: boolean,
): ExpenseCategory[] {
  const ordered: ExpenseCategory[] = [];
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    for (const category of categories.filter(
      (row) => (row.parentId ?? null) === parentId,
    )) {
      const path = prefix ? `${prefix} › ${category.name}` : category.name;
      ordered.push({ ...category, depth, path });
      visit(category.id, depth + 1, path);
    }
  };
  visit(null, 0, "");
  return ordered.filter(
    (row) => isActive === undefined || row.isActive === isActive,
  );
}

function inRange(
  expense: Expense,
  from: string | null,
  to: string | null,
): boolean {
  const d = day(expense.expenseDate);
  return (!from || d >= from) && (!to || d <= to);
}

export function expensesHandlers(store: ExpensesStore = makeExpensesStore()) {
  return [
    http.get(`${apiV1}/expense-categories`, ({ request }) => {
      const isActive = new URL(request.url).searchParams.get("isActive");
      return ok({
        expenseCategories: categoryTree(
          store.categories,
          isActive === null ? undefined : isActive === "true",
        ).map((category) => ({
          ...category,
          expenseCount: store.expenses.filter(
            (expense) => expense.categoryId === category.id,
          ).length,
        })),
      });
    }),
    http.post(`${apiV1}/expense-categories`, async ({ request }) => {
      const body = (await request.json()) as {
        name?: string;
        description?: string;
        parentId?: string | null;
      };
      if (!body.name)
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          { name: "Ce champ est obligatoire." },
        );
      sequence += 1;
      const category = makeExpenseCategory({
        id: `xcat-${sequence}`,
        name: body.name,
        description: body.description ?? null,
        parentId: body.parentId ?? null,
      });
      store.categories.push(category);
      return ok({ expenseCategory: category }, 201);
    }),
    http.patch(
      `${apiV1}/expense-categories/:id`,
      async ({ params, request }) => {
        const body = (await request.json()) as Partial<ExpenseCategory> & {
          version: number;
        };
        const category = store.categories.find((row) => row.id === params.id);
        if (!category)
          return apiError(
            404,
            "EXPENSE_CATEGORY_NOT_FOUND",
            "Catégorie introuvable.",
          );
        if (body.version !== category.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        // Issue 018: a parent is deactivated only once its sub-categories are.
        if (
          body.isActive === false &&
          store.categories.some(
            (row) => row.parentId === category.id && row.isActive,
          )
        )
          return apiError(
            409,
            "EXPENSE_CATEGORY_HAS_ACTIVE_CHILDREN",
            "Désactivez d'abord ses sous-catégories avant cette catégorie.",
          );
        Object.assign(category, body, { version: category.version + 1 });
        return ok({ expenseCategory: category });
      },
    ),
    http.get(`${apiV1}/expenses`, ({ request }) => {
      const url = new URL(request.url);
      const categoryId = url.searchParams.get("categoryId");
      const status = url.searchParams.get("status");
      const purchaseId = url.searchParams.get("purchaseId");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      return ok(
        makePage(
          store.expenses
            .filter(
              (expense) =>
                (!categoryId || expense.categoryId === categoryId) &&
                (!status || expense.status === status) &&
                (!purchaseId || expense.purchaseId === purchaseId) &&
                inRange(expense, from, to),
            )
            .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
        ),
      );
    }),
    http.get(`${apiV1}/expense-totals`, ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const posted = store.expenses.filter(
        (expense) => expense.status === "POSTED" && inRange(expense, from, to),
      );
      const byCategory = new Map<string, Decimal>();
      const byDate = new Map<string, Decimal>();
      for (const expense of posted) {
        byCategory.set(
          expense.categoryId,
          (byCategory.get(expense.categoryId) ?? new Decimal(0)).plus(
            expense.amountTnd,
          ),
        );
        byDate.set(
          day(expense.expenseDate),
          (byDate.get(day(expense.expenseDate)) ?? new Decimal(0)).plus(
            expense.amountTnd,
          ),
        );
      }
      return ok({
        expenseTotals: {
          totalTnd: posted
            .reduce(
              (sum, expense) => sum.plus(expense.amountTnd),
              new Decimal(0),
            )
            .toFixed(3),
          postedCount: posted.length,
          byCategory: [...byCategory].map(([categoryId, total]) => ({
            categoryId,
            categoryName:
              store.categories.find((row) => row.id === categoryId)?.name ?? "",
            totalTnd: total.toFixed(3),
          })),
          byDate: [...byDate]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([d, total]) => ({ day: d, totalTnd: total.toFixed(3) })),
          range: { from, to: to ?? new Date().toISOString() },
        },
      });
    }),
    http.post(`${apiV1}/expenses`, async ({ request }) => {
      const body = (await request.json()) as ExpenseInput;
      const category = store.categories.find(
        (row) => row.id === body.categoryId,
      );
      if (!category)
        return apiError(
          400,
          "ACTIVE_EXPENSE_CATEGORY_REQUIRED",
          "Une catégorie active est requise.",
        );
      sequence += 1;
      const expense = makeExpense({
        id: `expense-${sequence}`,
        reference: `DEP-${String(sequence).padStart(6, "0")}`,
        category,
        categoryId: category.id,
        status: body.post ? "POSTED" : "DRAFT",
        postedAt: body.post ? new Date().toISOString() : null,
        expenseDate: new Date(body.expenseDate).toISOString(),
        amountTnd: new Decimal(body.amountTnd).toFixed(3),
        description: body.description,
        externalReference: body.externalReference ?? null,
        notes: body.notes ?? null,
      });
      store.expenses.unshift(expense);
      return ok({ expense }, 201);
    }),
    http.get(`${apiV1}/expenses/:id`, ({ params }) => {
      const expense = store.expenses.find((row) => row.id === params.id);
      return expense
        ? ok({ expense })
        : apiError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable.");
    }),
    http.patch(`${apiV1}/expenses/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<ExpenseInput> & {
        version: number;
      };
      const expense = store.expenses.find((row) => row.id === params.id);
      if (!expense)
        return apiError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable.");
      if (expense.status !== "DRAFT")
        return apiError(
          409,
          "EXPENSE_NOT_EDITABLE",
          "Seule une dépense en brouillon peut être modifiée.",
        );
      if (body.version !== expense.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette fiche a été modifiée. Rechargez puis réessayez.",
        );
      const category = body.categoryId
        ? store.categories.find((row) => row.id === body.categoryId)
        : undefined;
      Object.assign(expense, {
        ...body,
        ...(category ? { category, categoryId: category.id } : {}),
        ...(body.amountTnd
          ? { amountTnd: new Decimal(body.amountTnd).toFixed(3) }
          : {}),
        ...(body.expenseDate
          ? { expenseDate: new Date(body.expenseDate).toISOString() }
          : {}),
        version: expense.version + 1,
      });
      return ok({ expense });
    }),
    http.post(`${apiV1}/expenses/:id/post`, async ({ params, request }) => {
      const body = (await request.json()) as { version: number };
      const expense = store.expenses.find((row) => row.id === params.id);
      if (!expense)
        return apiError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable.");
      if (expense.status !== "DRAFT")
        return apiError(
          409,
          "EXPENSE_NOT_POSTABLE",
          "Seule une dépense en brouillon peut être validée.",
        );
      if (body.version !== expense.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette fiche a été modifiée. Rechargez puis réessayez.",
        );
      Object.assign(expense, {
        status: "POSTED",
        postedAt: new Date().toISOString(),
        version: expense.version + 1,
      });
      return ok({ expense });
    }),
    http.post(`${apiV1}/expenses/:id/cancel`, async ({ params, request }) => {
      const body = (await request.json()) as {
        version: number;
        reason: string;
      };
      const expense = store.expenses.find((row) => row.id === params.id);
      if (!expense)
        return apiError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable.");
      if (expense.status !== "POSTED")
        return apiError(
          409,
          "EXPENSE_NOT_CANCELLABLE",
          "Seule une dépense validée peut être annulée.",
        );
      if (body.version !== expense.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette fiche a été modifiée. Rechargez puis réessayez.",
        );
      Object.assign(expense, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancellationReason: body.reason,
        version: expense.version + 1,
      });
      return ok({ expense });
    }),
  ];
}
