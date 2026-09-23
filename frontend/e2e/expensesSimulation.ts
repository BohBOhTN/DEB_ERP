import type { Page, Route } from "@playwright/test";

/// Browser-side expenses and simulation mock for the Sprint 25 flows.
interface Expense {
  id: string;
  reference: string;
  categoryId: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
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
  category: {
    id: string;
    name: string;
    description: null;
    isActive: true;
    version: 1;
  };
}

export interface ExpensesSimulationState {
  expenses: Expense[];
  simulations: Array<
    Record<string, unknown> & { id: string; name: string; version: number }
  >;
}

const electricity = {
  id: "xcat-1",
  name: "Électricité",
  description: null,
  isActive: true as const,
  version: 1 as const,
};
const rent = {
  id: "xcat-2",
  name: "Loyer",
  description: null,
  isActive: true as const,
  version: 1 as const,
};
const kg = {
  id: "unit-kg",
  code: "KG",
  name: "Kilogramme",
  symbol: "kg",
  precision: 3,
  isActive: true,
};
const piece = {
  id: "unit-piece",
  code: "PC",
  name: "Pièce",
  symbol: "pièce",
  precision: 0,
  isActive: true,
};
const flour = {
  id: "raw-1",
  code: null,
  name: "Farine T55",
  category: "Farines",
  baseUnitId: kg.id,
  isActive: true,
  notes: null,
  version: 1,
  createdAt: "2026-09-01T08:00:00.000Z",
  baseUnit: kg,
  conversions: [],
};

const today = new Date();
const monthDay = (day: number) =>
  new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day, 10),
  ).toISOString();

export function makeExpensesSimulationState(): ExpensesSimulationState {
  return {
    expenses: [
      {
        id: "expense-1",
        reference: "DEP-000001",
        categoryId: electricity.id,
        status: "POSTED",
        expenseDate: monthDay(3),
        amountTnd: "120.000",
        description: "Facture STEG",
        externalReference: null,
        method: "CASH",
        notes: null,
        responsibleUserId: "user-1",
        postedAt: monthDay(3),
        cancelledAt: null,
        cancellationReason: null,
        version: 1,
        createdAt: monthDay(3),
        category: electricity,
      },
      {
        id: "expense-2",
        reference: "DEP-000002",
        categoryId: rent.id,
        status: "POSTED",
        expenseDate: monthDay(2),
        amountTnd: "800.000",
        description: "Loyer du mois",
        externalReference: null,
        method: "CASH",
        notes: null,
        responsibleUserId: "user-1",
        postedAt: monthDay(2),
        cancelledAt: null,
        cancellationReason: null,
        version: 1,
        createdAt: monthDay(2),
        category: rent,
      },
    ],
    simulations: [],
  };
}

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ data, meta: { correlationId: "e2e" } }),
});
const failure = (status: number, code: string, message: string) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ error: { code, message, correlationId: "e2e" } }),
});
const page = (items: unknown[]) =>
  envelope({ items, page: 1, pageSize: 25, total: items.length, pageCount: 1 });
const money = (value: number) => value.toFixed(3);
let sequence = 0;

export async function handleExpensesSimulation(
  route: Route,
  state: ExpensesSimulationState,
): Promise<boolean> {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const method = route.request().method();
  const body = () => route.request().postDataJSON() as Record<string, unknown>;
  const inRange = (expense: Expense) => {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const day = expense.expenseDate.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  };

  if (path === "/expense-categories")
    return (
      route.fulfill(
        envelope({
          expenseCategories: [electricity, rent].map((category) => ({
            ...category,
            expenseCount: state.expenses.filter(
              (expense) => expense.categoryId === category.id,
            ).length,
          })),
        }),
      ),
      true
    );
  if (path === "/expenses" && method === "GET")
    return (route.fulfill(page(state.expenses.filter(inRange))), true);
  if (path === "/expense-totals") {
    const posted = state.expenses.filter(
      (expense) => expense.status === "POSTED" && inRange(expense),
    );
    const byCategory = [electricity, rent]
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        totalTnd: money(
          posted
            .filter((expense) => expense.categoryId === category.id)
            .reduce((sum, expense) => sum + Number(expense.amountTnd), 0),
        ),
      }))
      .filter((row) => Number(row.totalTnd) > 0);
    return (
      route.fulfill(
        envelope({
          expenseTotals: {
            totalTnd: money(
              posted.reduce(
                (sum, expense) => sum + Number(expense.amountTnd),
                0,
              ),
            ),
            postedCount: posted.length,
            byCategory,
            byDate: posted.map((expense) => ({
              day: expense.expenseDate.slice(0, 10),
              totalTnd: expense.amountTnd,
            })),
            range: { from: null, to: new Date().toISOString() },
          },
        }),
      ),
      true
    );
  }
  const cancelMatch = /^\/expenses\/([^/]+)\/cancel$/.exec(path);
  if (cancelMatch) {
    const expense = state.expenses.find((row) => row.id === cancelMatch[1]);
    if (!expense)
      return (
        route.fulfill(
          failure(404, "EXPENSE_NOT_FOUND", "Dépense introuvable."),
        ),
        true
      );
    Object.assign(expense, {
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      cancellationReason: body().reason,
      version: expense.version + 1,
    });
    return (route.fulfill(envelope({ expense })), true);
  }
  const expenseMatch = /^\/expenses\/([^/]+)$/.exec(path);
  if (expenseMatch) {
    const expense = state.expenses.find((row) => row.id === expenseMatch[1]);
    return (
      route.fulfill(
        expense
          ? envelope({ expense })
          : failure(404, "EXPENSE_NOT_FOUND", "Dépense introuvable."),
      ),
      true
    );
  }

  if (path === "/catalog/units")
    return (route.fulfill(page([kg, piece])), true);
  if (path === "/catalog/raw-materials")
    return (route.fulfill(page([flour])), true);
  if (path === "/catalog/products") return (route.fulfill(page([])), true);
  if (path === "/inventory/balances")
    return (route.fulfill(envelope({ items: [] })), true);
  if (path === "/procurement/purchases") return (route.fulfill(page([])), true);

  if (path === "/cost-simulations" && method === "GET")
    return (route.fulfill(page(state.simulations)), true);
  if (path === "/cost-simulations" && method === "POST") {
    sequence += 1;
    const input = body();
    const ingredients = (
      input.ingredients as Array<Record<string, string>>
    ).map((line, index) => {
      const factor = Number(line.conversionFactorToBase ?? 1);
      const base = Number(line.enteredQuantity) * factor;
      const unit =
        [kg, piece].find((candidate) => candidate.id === line.enteredUnitId) ??
        kg;
      return {
        id: `ingr-${sequence}-${index}`,
        rawMaterialId: line.rawMaterialId ?? null,
        ingredientName: line.ingredientName ?? flour.name,
        enteredQuantity: Number(line.enteredQuantity).toFixed(6),
        enteredUnitId: unit.id,
        conversionFactorToBase: factor.toFixed(6),
        baseQuantity: base.toFixed(6),
        unitPriceTnd: money(Number(line.unitPriceTnd)),
        priceBasisUnitId: line.priceBasisUnitId,
        lineCostTnd: money(base * Number(line.unitPriceTnd)),
        enteredUnitNameSnapshot: unit.name,
        priceBasisUnitNameSnapshot: unit.name,
        position: index,
      };
    });
    const total = ingredients.reduce(
      (sum, line) => sum + Number(line.lineCostTnd),
      0,
    );
    const outputUnit =
      [kg, piece].find((candidate) => candidate.id === input.outputUnitId) ??
      piece;
    const simulation = {
      id: `sim-${sequence}`,
      name: input.name as string,
      targetProductId: null,
      targetProductNameSnapshot: null,
      outputQuantity: Number(input.outputQuantity).toFixed(6),
      outputUnitId: outputUnit.id,
      outputUnitNameSnapshot: outputUnit.name,
      notes: null,
      totalIngredientCostTnd: money(total),
      costPerOutputUnitTnd: money(total / Number(input.outputQuantity)),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetProduct: null,
      outputUnit,
      ingredients,
    };
    state.simulations.unshift(simulation);
    return (route.fulfill(envelope({ simulation }, 201)), true);
  }
  const simMatch = /^\/cost-simulations\/([^/]+)$/.exec(path);
  if (simMatch) {
    const simulation = state.simulations.find((row) => row.id === simMatch[1]);
    return (
      route.fulfill(
        simulation
          ? envelope({ simulation })
          : failure(404, "SIMULATION_NOT_FOUND", "Simulation introuvable."),
      ),
      true
    );
  }
  return false;
}

export async function mockExpensesSimulation(
  page: Page,
  state: ExpensesSimulationState,
): Promise<void> {
  for (const glob of [
    "**/api/v1/expense**",
    "**/api/v1/cost-simulations**",
    "**/api/v1/catalog/**",
    "**/api/v1/inventory/**",
    "**/api/v1/procurement/purchases**",
  ]) {
    await page.route(glob, (route) => handleExpensesSimulation(route, state));
  }
}
