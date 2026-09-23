import type { Page, Route } from "@playwright/test";

/// The API as the shell needs it, mocked in the browser so the smoke runs
/// without a backend. Shapes mirror the msw fixtures used by the unit tests.
export const ownerPermissions = [
  "pos.access",
  "pos.sell",
  "pos.open_session",
  "pos.credit_sale",
  "pos.close_session",
  "orders.view",
  "orders.create",
  "orders.update",
  "orders.change_status",
  "orders.complete",
  "orders.cancel",
  "customers.view",
  "customers.create",
  "customers.update",
  "customer_payments.view",
  "customer_payments.create",
  "customer_balances.view",
  "distributors.view",
  "distributors.create",
  "distributors.update",
  "distribution.dispatch",
  "distribution.settle",
  "distribution.direct_sale",
  "distributor_payments.view",
  "distributor_payments.create",
  "distribution.custody.view",
  "distribution.balances.view",
  "purchases.view",
  "purchases.create",
  "purchases.post",
  "purchases.cancel",
  "suppliers.view",
  "suppliers.create",
  "suppliers.update",
  "supplier_payments.view",
  "supplier_payments.create",
  "supplier_balances.view",
  "products.view",
  "products.create",
  "products.update",
  "products.activate",
  "raw_materials.create",
  "raw_materials.update",
  "raw_materials.activate",
  "categories.manage",
  "units.manage",
  "inventory.adjust",
  "inventory.opening_stock",
  "raw_materials.view",
  "categories.view",
  "units.view",
  "inventory.view",
  "inventory.movements.view",
  "expenses.view",
  "expenses.create",
  "expenses.cancel",
  "expense_categories.manage",
  "simulations.view",
  "simulations.create",
  "simulations.update",
  "simulations.delete",
  "users.view",
  "roles.view",
  "audit.view",
];

export interface MockState {
  signedIn: boolean;
  permissions: string[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Accept-Language, X-Correlation-Id, Idempotency-Key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  headers: corsHeaders,
  body: JSON.stringify({ data, meta: { correlationId: "e2e" } }),
});

const failure = (status: number, code: string, message: string) => ({
  status,
  contentType: "application/json",
  headers: corsHeaders,
  body: JSON.stringify({ error: { code, message, correlationId: "e2e" } }),
});

function user(state: MockState) {
  return {
    id: "user-1",
    email: "salma@example.com",
    displayName: "Salma Ben Ali",
    effectivePermissions: state.permissions,
    roles: [{ id: "role-1", name: "Gérante" }],
    sessionExpiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
  };
}

export async function mockApi(
  page: Page,
  state: MockState,
): Promise<MockState> {
  // Narrow to the API prefix: a broader glob would also catch Vite module
  // URLs such as /src/lib/api/errors.ts.
  await page.route("**/api/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api(\/v1)?/, "");
    const method = route.request().method();

    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }

    if (path === "/auth/me") {
      return route.fulfill(
        state.signedIn
          ? envelope({ user: user(state) })
          : failure(
              401,
              "AUTHENTICATION_REQUIRED",
              "Votre session n'est plus valide.",
            ),
      );
    }

    if (path === "/auth/login" && method === "POST") {
      const body = route.request().postDataJSON() as { password?: string };
      if (body.password !== "correct-password") {
        return route.fulfill(
          failure(401, "AUTHENTICATION_REQUIRED", "Identifiants invalides."),
        );
      }
      state.signedIn = true;
      return route.fulfill(
        envelope({
          user: user(state),
          expiresAt: user(state).sessionExpiresAt,
        }),
      );
    }

    if (path === "/auth/logout" && method === "POST") {
      state.signedIn = false;
      return route.fulfill(envelope({ success: true }));
    }

    if (path === "/home/summary") {
      return route.fulfill(
        envelope({
          summary: {
            date: "2026-09-23",
            generatedAt: new Date().toISOString(),
            sales: {
              today: {
                count: 14,
                totalTnd: "1250.000",
                cashTnd: "980.000",
                creditTnd: "270.000",
              },
              previousDay: {
                count: 11,
                totalTnd: "1116.000",
                cashTnd: "900.000",
                creditTnd: "216.000",
              },
            },
            openSession: {
              id: "s1",
              openedAt: "2026-09-23T07:12:00.000Z",
              terminal: "Caisse principale",
              cashier: { id: "u2", displayName: "Amine" },
              openingCashTnd: "50.000",
            },
            receivables: {
              customersTnd: "2340.500",
              distributorsTnd: "410.000",
            },
            payables: {
              suppliersTnd: "5120.000",
              overdueCount: 3,
              overdueTnd: "1800.000",
            },
            orders: { dueTodayCount: 4, overdueCount: 2, readyCount: 1 },
            stock: {
              negativeCount: 1,
              items: [
                {
                  itemType: "RAW_MATERIAL",
                  itemId: "rm1",
                  name: "Farine T55",
                  quantity: "-2.500",
                },
              ],
            },
            expenses: { monthTnd: "1250.000", monthCount: 9 },
            custody: { heldLinesCount: 12 },
            recent: [
              {
                id: "e1",
                at: new Date(Date.now() - 300_000).toISOString(),
                action: "pos_sale.post",
                actionLabelFr: "Vente en caisse",
                entity: "sale",
                entityLabelFr: "Vente",
                targetId: "sale1",
                module: "pos",
                actor: { id: "u2", displayName: "Amine" },
              },
            ],
          },
        }),
      );
    }

    // Every screen lists something on mount; an empty page keeps it quiet.
    if (method === "GET") {
      return route.fulfill(
        envelope({ items: [], page: 1, pageSize: 25, total: 0, pageCount: 1 }),
      );
    }

    return route.fulfill(envelope({}));
  });

  return state;
}
