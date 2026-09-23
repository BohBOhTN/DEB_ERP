import type { Page, Route } from "@playwright/test";

/// Browser-side customers, orders and POS session mock for the Sprint 22
/// flows: receivables derive from sales, advances from order receipts.
interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
}

interface Sale {
  id: string;
  reference: string;
  customerId: string | null;
  status: "POSTED";
  paymentState: "PAID" | "PARTIALLY_PAID" | "UNPAID";
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
}

interface Order {
  id: string;
  reference: string;
  customerId: string;
  status: string;
  requestedFulfillmentAt: string;
  totalTnd: string;
  advanceBalanceTnd: string;
  notes: string | null;
  version: number;
  saleId: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  advanceDisposition: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    productId: string;
    unitId: string;
    quantity: string;
    unitPriceTnd: string;
    lineTotalTnd: string;
    productNameSnapshot: string;
    unitNameSnapshot: string;
  }>;
  advances: Array<{
    id: string;
    movement: "RECEIPT";
    amountTnd: string;
    paidAt: string;
    notes: string | null;
  }>;
  sale: (Sale & { lines: unknown[] }) | null;
}

export interface CustomersOrdersState {
  sessionOpen: boolean;
  customers: Customer[];
  sales: Sale[];
  orders: Order[];
  payments: Array<{
    id: string;
    customerId: string;
    amountTnd: string;
    paidAt: string;
    allocations: Array<{ saleId: string; amountTnd: string }>;
  }>;
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
  id: "product-1",
  code: null,
  barcode: null,
  name: "Pain complet",
  salePriceTnd: "4.000",
  isStockable: true,
  isActive: true,
  baseUnit: piece,
  category: {
    id: "category-bread",
    name: "Pains",
    description: null,
    isActive: true,
  },
};
const session = {
  id: "session-1",
  status: "OPEN",
  openedAt: new Date().toISOString(),
  openedByUserId: "user-1",
  openingCashTnd: "50.000",
  terminal: { id: "terminal-1", code: "MAIN", name: "Caisse principale" },
};

export function makeCustomersOrdersState(): CustomersOrdersState {
  return {
    sessionOpen: true,
    customers: [
      {
        id: "customer-1",
        name: "Amel Trabelsi",
        phone: "22 000 000",
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        version: 1,
        createdAt: "2026-09-01T08:00:00.000Z",
      },
    ],
    sales: [],
    orders: [],
    payments: [],
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

function receivable(state: CustomersOrdersState, customerId: string): number {
  const allocated = (saleId: string) =>
    state.payments
      .flatMap((payment) => payment.allocations)
      .filter((allocation) => allocation.saleId === saleId)
      .reduce((sum, allocation) => sum + Number(allocation.amountTnd), 0);
  return state.sales
    .filter((sale) => sale.customerId === customerId)
    .reduce(
      (sum, sale) => sum + Number(sale.remainingDueTnd) - allocated(sale.id),
      0,
    );
}

function advance(state: CustomersOrdersState, customerId: string): number {
  return state.orders
    .filter(
      (order) =>
        order.customerId === customerId &&
        !["COMPLETED", "CANCELLED"].includes(order.status),
    )
    .reduce((sum, order) => sum + Number(order.advanceBalanceTnd), 0);
}

function withCustomer(state: CustomersOrdersState, order: Order) {
  const { lines, advances, sale, ...rest } = order;
  return {
    ...rest,
    customer: state.customers.find((row) => row.id === order.customerId),
    _count: { lines: lines.length },
    lines,
    advances,
    sale,
  };
}

export async function handleCustomersOrders(
  route: Route,
  state: CustomersOrdersState,
): Promise<boolean> {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const method = route.request().method();
  const body = () => route.request().postDataJSON() as Record<string, unknown>;
  const hasKey = () => Boolean(route.request().headers()["idempotency-key"]);

  if (path === "/pos/sessions/current")
    return (
      route.fulfill(envelope({ session: state.sessionOpen ? session : null })),
      true
    );
  if (path === "/pos/products") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          [bread].filter((product) => product.name.toLowerCase().includes(q)),
        ),
      ),
      true
    );
  }

  if (path === "/customers/customer-balances") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          state.customers
            .filter((customer) => customer.name.toLowerCase().includes(q))
            .map((customer) => ({
              customer,
              balanceTnd: money(receivable(state, customer.id)),
              advanceBalanceTnd: money(advance(state, customer.id)),
              openSaleCount: 0,
              openOrderCount: state.orders.filter(
                (order) =>
                  order.customerId === customer.id &&
                  !["COMPLETED", "CANCELLED"].includes(order.status),
              ).length,
              openSales: [],
            })),
        ),
      ),
      true
    );
  }

  const customerMatch = /^\/customers\/customers\/([^/]+)(\/statement)?$/.exec(
    path,
  );
  if (customerMatch) {
    const customer = state.customers.find((row) => row.id === customerMatch[1]);
    if (!customer)
      return (
        route.fulfill(
          failure(404, "CUSTOMER_NOT_FOUND", "Client introuvable."),
        ),
        true
      );
    const balance = money(receivable(state, customer.id));
    if (customerMatch[2]) {
      return (
        route.fulfill(
          envelope({
            statement: {
              customer,
              balanceTnd: balance,
              advanceBalanceTnd: money(advance(state, customer.id)),
              sales: state.sales
                .filter((sale) => sale.customerId === customer.id)
                .map((sale) => ({ ...sale, balanceTnd: sale.remainingDueTnd })),
              orders: [],
              ledgerEntries: [],
              payments: [],
              meta: {
                openingBalanceTnd: "0.000",
                closingBalanceTnd: balance,
                nextCursor: null,
                basis: "Solde = ventes à crédit − règlements",
                hasMoreSales: false,
                hasMorePayments: false,
              },
            },
          }),
        ),
        true
      );
    }
    return (
      route.fulfill(
        envelope({
          customer: {
            ...customer,
            balanceTnd: balance,
            advanceBalanceTnd: money(advance(state, customer.id)),
          },
        }),
      ),
      true
    );
  }

  if (path === "/customers/customer-payments" && method === "GET")
    return (route.fulfill(page([])), true);

  if (path === "/orders/orders" && method === "GET") {
    const status = url.searchParams.get("status");
    const dueState = url.searchParams.get("dueState");
    const now = Date.now();
    const rows = state.orders
      .filter((order) => !status || order.status === status)
      .filter(
        (order) =>
          !dueState ||
          (!["COMPLETED", "CANCELLED"].includes(order.status) &&
            (dueState === "OVERDUE"
              ? new Date(order.requestedFulfillmentAt).getTime() < now
              : new Date(order.requestedFulfillmentAt).getTime() >= now)),
      )
      .map((order) => withCustomer(state, order));
    return (route.fulfill(page(rows)), true);
  }

  if (path === "/orders/orders" && method === "POST") {
    if (!hasKey())
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
    const input = body();
    sequence += 1;
    const lines = (
      input.lines as Array<{ productId: string; quantity: string }>
    ).map((line, index) => ({
      id: `oline-${sequence}-${index}`,
      productId: line.productId,
      unitId: piece.id,
      quantity: Number(line.quantity).toFixed(6),
      unitPriceTnd: bread.salePriceTnd,
      lineTotalTnd: money(Number(line.quantity) * Number(bread.salePriceTnd)),
      productNameSnapshot: bread.name,
      unitNameSnapshot: piece.name,
    }));
    const order: Order = {
      id: `order-${sequence}`,
      reference: `CMD-${String(sequence).padStart(6, "0")}`,
      customerId: input.customerId as string,
      status: "DRAFT",
      requestedFulfillmentAt: new Date(
        input.requestedFulfillmentAt as string,
      ).toISOString(),
      totalTnd: money(
        lines.reduce((sum, line) => sum + Number(line.lineTotalTnd), 0),
      ),
      advanceBalanceTnd: "0.000",
      notes: (input.notes as string) ?? null,
      version: 1,
      saleId: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      advanceDisposition: null,
      createdAt: new Date().toISOString(),
      lines,
      advances: [],
      sale: null,
    };
    state.orders.unshift(order);
    return (
      route.fulfill(envelope({ order: withCustomer(state, order) }, 201)),
      true
    );
  }

  const orderMatch =
    /^\/orders\/orders\/([^/]+)(\/status|\/advances|\/complete|\/cancel)?$/.exec(
      path,
    );
  if (orderMatch) {
    const order = state.orders.find((row) => row.id === orderMatch[1]);
    if (!order)
      return (
        route.fulfill(failure(404, "ORDER_NOT_FOUND", "Commande introuvable.")),
        true
      );
    const input = method === "POST" ? body() : {};
    if (orderMatch[2] === "/status") {
      Object.assign(order, {
        status: input.status,
        version: order.version + 1,
      });
    } else if (orderMatch[2] === "/advances") {
      if (!hasKey())
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
      sequence += 1;
      const receipt = {
        id: `advance-${sequence}`,
        movement: "RECEIPT" as const,
        amountTnd: money(Number(input.amountTnd)),
        paidAt: new Date(input.paidAt as string).toISOString(),
        notes: null,
      };
      order.advances.push(receipt);
      order.advanceBalanceTnd = money(
        Number(order.advanceBalanceTnd) + Number(receipt.amountTnd),
      );
      order.version += 1;
      return (
        route.fulfill(
          envelope(
            { order: withCustomer(state, order), advance: receipt },
            201,
          ),
        ),
        true
      );
    } else if (orderMatch[2] === "/complete") {
      if (!hasKey())
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
      sequence += 1;
      const paid =
        Number(input.paidAmountTnd ?? 0) + Number(order.advanceBalanceTnd);
      const remaining = Number(order.totalTnd) - paid;
      const sale: Sale = {
        id: `sale-${sequence}`,
        reference: `VT-${String(sequence).padStart(6, "0")}`,
        customerId: order.customerId,
        status: "POSTED",
        paymentState:
          remaining <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
        soldAt: new Date().toISOString(),
        totalTnd: order.totalTnd,
        paidAmountTnd: money(paid),
        remainingDueTnd: money(Math.max(remaining, 0)),
      };
      state.sales.unshift(sale);
      Object.assign(order, {
        status: "COMPLETED",
        saleId: sale.id,
        completedAt: sale.soldAt,
        advanceBalanceTnd: "0.000",
        version: order.version + 1,
        sale: { ...sale, lines: [] },
      });
      return (
        route.fulfill(envelope({ order: withCustomer(state, order) }, 201)),
        true
      );
    } else if (orderMatch[2] === "/cancel") {
      Object.assign(order, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancellationReason: input.reason,
        advanceDisposition: input.advanceDisposition ?? null,
        version: order.version + 1,
      });
    }
    return (
      route.fulfill(envelope({ order: withCustomer(state, order) })),
      true
    );
  }

  return false;
}

export async function mockCustomersOrders(
  page: Page,
  state: CustomersOrdersState,
): Promise<void> {
  await page.route("**/api/v1/customers/**", (route) =>
    handleCustomersOrders(route, state),
  );
  await page.route("**/api/v1/orders/**", (route) =>
    handleCustomersOrders(route, state),
  );
  await page.route("**/api/v1/pos/**", (route) =>
    handleCustomersOrders(route, state),
  );
}
