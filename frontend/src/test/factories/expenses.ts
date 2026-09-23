import type {
  Expense,
  ExpenseCategory,
} from "../../features/expenses/expenses.api.js";

let sequence = 0;
const next = () => (sequence += 1);

export const electricity: ExpenseCategory = {
  id: "xcat-1",
  name: "Électricité",
  description: null,
  isActive: true,
  version: 1,
  expenseCount: 0,
};
export const rent: ExpenseCategory = {
  id: "xcat-2",
  name: "Loyer",
  description: null,
  isActive: true,
  version: 1,
  expenseCount: 0,
};

export function makeExpenseCategory(
  overrides: Partial<ExpenseCategory> = {},
): ExpenseCategory {
  const n = next();
  return {
    id: `xcat-${n + 10}`,
    name: `Catégorie ${n}`,
    description: null,
    isActive: true,
    version: 1,
    expenseCount: 0,
    ...overrides,
  };
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  const n = next();
  const category = overrides.category ?? electricity;
  return {
    id: `expense-${n}`,
    reference: `DEP-${String(n).padStart(6, "0")}`,
    categoryId: category.id,
    status: "POSTED",
    expenseDate: "2026-09-10T10:00:00.000Z",
    amountTnd: "120.000",
    description: "Facture STEG",
    externalReference: null,
    method: "CASH",
    notes: null,
    responsibleUserId: "user-1",
    postedAt: "2026-09-10T10:05:00.000Z",
    cancelledAt: null,
    cancellationReason: null,
    version: 1,
    createdAt: "2026-09-10T10:00:00.000Z",
    category,
    ...overrides,
  };
}
