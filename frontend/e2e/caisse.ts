import type { Page, Route } from "@playwright/test";

/// Browser-side till mock for the Sprint 23 flows: one session, product
/// and customer lookups, sales with idempotent replay, session history.
interface Session {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openedByUserId: string;
  openingCashTnd: string;
  closedAt: string | null;
  closedByUserId: string | null;
  countedCashTnd: string | null;
  expectedCashTnd: string | null;
  cashDifferenceTnd: string | null;
  notes: string | null;
  terminal: { id: string; code: string; name: string };
  openedBy: { id: string; displayName: string };
  closedBy: { id: string; displayName: string } | null;
}

interface Sale {
  id: string;
  reference: string;
  sessionId: string;
  customerId: string | null;
  status: "POSTED";
  paymentState: "PAID" | "PARTIALLY_PAID" | "UNPAID";
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  postedAt: string;
  postedByUserId: string;
  customer: { id: string; name: string } | null;
  postedBy: { id: string; displayName: string };
  lines: Array<{
    id: string;
    productId: string;
    quantity: string;
    unitPriceTnd: string;
    lineTotalTnd: string;
    productNameSnapshot: string;
    unitNameSnapshot: string;
  }>;
  payments: Array<{
    id: string;
    amountTnd: string;
    method: "CASH";
    paidAt: string;
  }>;
}

export interface CaisseState {
  session: Session | null;
  sessions: Session[];
  sales: Sale[];
  saleKeys: Map<string, string>;
  /// The next sale post commits but its response is lost (AS-V2-19).
  dropNextSaleResponse: boolean;
}

const piece = {
  id: "unit-piece",
  code: "PC",
  name: "Pièce",
  symbol: "pièce",
  precision: 0,
  isActive: true,
};
const bread = {
  id: "category-bread",
  name: "Pains",
  description: null,
  isActive: true,
};
const pastry = {
  id: "category-pastry",
  name: "Viennoiseries",
  description: null,
  isActive: true,
};
const products = [
  {
    id: "product-1",
    code: null,
    barcode: null,
    name: "Pain complet",
    salePriceTnd: "1.200",
    isStockable: true,
    isActive: true,
    baseUnit: piece,
    category: bread,
  },
  {
    id: "product-2",
    code: null,
    barcode: null,
    name: "Croissant",
    salePriceTnd: "1.000",
    isStockable: true,
    isActive: true,
    baseUnit: piece,
    category: pastry,
  },
  {
    id: "product-3",
    code: null,
    barcode: null,
    name: "Pain de mie",
    salePriceTnd: "2.500",
    isStockable: true,
    isActive: true,
    baseUnit: piece,
    category: bread,
  },
];
const customers = [
  {
    id: "customer-1",
    name: "Amel Trabelsi",
    phone: "22 000 000",
    isActive: true,
  },
];
const cashier = { id: "user-1", displayName: "Salma Ben Ali" };

export function makeCaisseState(): CaisseState {
  return {
    session: null,
    sessions: [],
    sales: [],
    saleKeys: new Map(),
    dropNextSaleResponse: false,
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

function totalsOf(state: CaisseState, sessionId: string) {
  const sales = state.sales.filter((sale) => sale.sessionId === sessionId);
  const sum = (pick: (sale: Sale) => string) =>
    sales.reduce((acc, sale) => acc + Number(pick(sale)), 0);
  return {
    salesCount: sales.length,
    salesTotalTnd: money(sum((s) => s.totalTnd)),
    creditGrantedTnd: money(sum((s) => s.remainingDueTnd)),
    cashCollectedTnd: money(sum((s) => s.paidAmountTnd)),
    advancesReceivedTnd: "0.000",
    advancesRefundedTnd: "0.000",
    customerPaymentsTnd: "0.000",
  };
}

export async function handleCaisse(
  route: Route,
  state: CaisseState,
): Promise<boolean> {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const method = route.request().method();
  const body = () => route.request().postDataJSON() as Record<string, unknown>;
  const key = route.request().headers()["idempotency-key"];

  if (path === "/pos/sessions/current")
    return (route.fulfill(envelope({ session: state.session })), true);
  if (path === "/pos/products") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          products.filter((product) => product.name.toLowerCase().includes(q)),
        ),
      ),
      true
    );
  }
  if (path === "/pos/customers") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          customers.filter((customer) =>
            customer.name.toLowerCase().includes(q),
          ),
        ),
      ),
      true
    );
  }
  if (path === "/pos/sessions/open" && method === "POST") {
    if (state.session)
      return (
        route.fulfill(
          failure(
            409,
            "POS_SESSION_ALREADY_OPEN",
            "Une session de caisse est déjà ouverte.",
          ),
        ),
        true
      );
    sequence += 1;
    state.session = {
      id: `session-${sequence}`,
      status: "OPEN",
      openedAt: new Date().toISOString(),
      openedByUserId: cashier.id,
      openingCashTnd: money(Number(body().openingCashTnd)),
      closedAt: null,
      closedByUserId: null,
      countedCashTnd: null,
      expectedCashTnd: null,
      cashDifferenceTnd: null,
      notes: null,
      terminal: { id: "terminal-1", code: "MAIN", name: "Caisse principale" },
      openedBy: cashier,
      closedBy: null,
    };
    state.sessions.unshift(state.session);
    return (route.fulfill(envelope({ session: state.session }, 201)), true);
  }
  const closeMatch = /^\/pos\/sessions\/([^/]+)\/close$/.exec(path);
  if (closeMatch && method === "POST") {
    const session = state.sessions.find((row) => row.id === closeMatch[1]);
    if (!session || session.status !== "OPEN")
      return (
        route.fulfill(
          failure(
            409,
            "POS_SESSION_NOT_OPEN",
            "Aucune session de caisse ouverte.",
          ),
        ),
        true
      );
    const expected =
      Number(session.openingCashTnd) +
      Number(totalsOf(state, session.id).cashCollectedTnd);
    const counted = Number(body().countedCashTnd);
    Object.assign(session, {
      status: "CLOSED",
      closedAt: new Date().toISOString(),
      closedByUserId: cashier.id,
      closedBy: cashier,
      countedCashTnd: money(counted),
      expectedCashTnd: money(expected),
      cashDifferenceTnd: money(counted - expected),
    });
    state.session = null;
    return (route.fulfill(envelope({ session }, 201)), true);
  }
  if (path === "/pos/sales" && method === "POST") {
    if (!key)
      return (
        route.fulfill(
          failure(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Une clé d'idempotence est requise.",
          ),
        ),
        true
      );
    const replayed = state.saleKeys.get(key);
    if (replayed)
      return (
        route.fulfill({
          ...envelope(
            { sale: state.sales.find((sale) => sale.id === replayed) },
            201,
          ),
          headers: { "Idempotency-Replayed": "true" },
        }),
        true
      );
    if (!state.session)
      return (
        route.fulfill(
          failure(
            409,
            "POS_SESSION_NOT_OPEN",
            "Ouvrez une session de caisse avant cette opération.",
          ),
        ),
        true
      );
    const input = body();
    sequence += 1;
    const lines = (
      input.lines as Array<{ productId: string; quantity: string }>
    ).map((line, index) => {
      const product =
        products.find((candidate) => candidate.id === line.productId) ??
        products[0]!;
      return {
        id: `sline-${sequence}-${index}`,
        productId: product.id,
        quantity: Number(line.quantity).toFixed(6),
        unitPriceTnd: product.salePriceTnd,
        lineTotalTnd: money(
          Number(line.quantity) * Number(product.salePriceTnd),
        ),
        productNameSnapshot: product.name,
        unitNameSnapshot: piece.name,
      };
    });
    const total = lines.reduce(
      (sum, line) => sum + Number(line.lineTotalTnd),
      0,
    );
    const paid =
      input.paidAmountTnd === undefined
        ? total
        : Math.min(Number(input.paidAmountTnd), total);
    const remaining = total - paid;
    if (remaining > 0 && !input.customerId)
      return (
        route.fulfill(
          failure(
            400,
            "CUSTOMER_REQUIRED_FOR_CREDIT",
            "Un client enregistré est obligatoire pour une vente à crédit.",
          ),
        ),
        true
      );
    const customer =
      customers.find((row) => row.id === input.customerId) ?? null;
    const sale: Sale = {
      id: `sale-${sequence}`,
      reference: `VT-${String(sequence).padStart(6, "0")}`,
      sessionId: state.session.id,
      customerId: customer?.id ?? null,
      status: "POSTED",
      paymentState:
        remaining === 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
      soldAt: new Date().toISOString(),
      totalTnd: money(total),
      paidAmountTnd: money(paid),
      remainingDueTnd: money(remaining),
      postedAt: new Date().toISOString(),
      postedByUserId: cashier.id,
      customer: customer ? { id: customer.id, name: customer.name } : null,
      postedBy: cashier,
      lines,
      payments:
        paid > 0
          ? [
              {
                id: `spay-${sequence}`,
                amountTnd: money(paid),
                method: "CASH",
                paidAt: new Date().toISOString(),
              },
            ]
          : [],
    };
    state.sales.unshift(sale);
    state.saleKeys.set(key, sale.id);
    if (state.dropNextSaleResponse) {
      state.dropNextSaleResponse = false;
      return (route.abort("connectionreset"), true);
    }
    return (route.fulfill(envelope({ sale }, 201)), true);
  }
  if (path === "/pos/sales" && method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    return (
      route.fulfill(
        page(
          state.sales.filter(
            (sale) => !sessionId || sale.sessionId === sessionId,
          ),
        ),
      ),
      true
    );
  }
  const saleMatch = /^\/pos\/sales\/([^/]+)$/.exec(path);
  if (saleMatch) {
    const sale = state.sales.find((row) => row.id === saleMatch[1]);
    return (
      route.fulfill(
        sale
          ? envelope({
              sale: {
                ...sale,
                session: state.sessions.find(
                  (row) => row.id === sale.sessionId,
                ),
              },
            })
          : failure(404, "SALE_NOT_FOUND", "Vente introuvable."),
      ),
      true
    );
  }
  if (path === "/pos/sessions")
    return (
      route.fulfill(
        page(
          state.sessions.map((session) => ({
            ...session,
            ...totalsOf(state, session.id),
          })),
        ),
      ),
      true
    );
  const sessionMatch = /^\/pos\/sessions\/([^/]+)$/.exec(path);
  if (sessionMatch) {
    const session = state.sessions.find((row) => row.id === sessionMatch[1]);
    return (
      route.fulfill(
        session
          ? envelope({ session, totals: totalsOf(state, session.id) })
          : failure(
              404,
              "POS_SESSION_NOT_FOUND",
              "Session de caisse introuvable.",
            ),
      ),
      true
    );
  }
  return false;
}

export async function mockCaisse(
  page: Page,
  state: CaisseState,
): Promise<void> {
  await page.route("**/api/v1/pos/**", (route) => handleCaisse(route, state));
}
