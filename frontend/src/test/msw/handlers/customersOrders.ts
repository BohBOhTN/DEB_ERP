import Decimal from "decimal.js-light";
import { http } from "msw";
import type {
  Customer,
  CustomerPayment,
  CustomerPaymentInput,
  SaleSummary,
} from "../../../features/customers/customers.api.js";
import type {
  AdvanceDisposition,
  Order,
  OrderInput,
} from "../../../features/orders/orders.api.js";
import type { PosSession } from "../../../features/pos/pos.api.js";
import { makeProduct, piece } from "../../factories/catalog.js";
import {
  makeCustomer,
  makeCustomerPayment,
  makeOrder,
  makeSale,
} from "../../factories/customers.js";
import { makePosSession } from "../../factories/pos.js";
import { makePage } from "../../factories/page.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// In-memory customers, sales, orders and the POS session: receivables
/// derive from posted sales minus allocations, advances from order
/// receipts, like the customer ledger.
export interface CustomersOrdersStore {
  session: PosSession | null;
  customers: Customer[];
  sales: SaleSummary[];
  payments: CustomerPayment[];
  orders: Order[];
}

const openStatuses = new Set(["DRAFT", "CONFIRMED", "PREPARING", "READY"]);
const bread = makeProduct({
  id: "product-1",
  name: "Pain complet",
  salePriceTnd: "4.000",
  baseUnit: piece,
  baseUnitId: piece.id,
});
const croissant = makeProduct({
  id: "product-2",
  name: "Croissant",
  salePriceTnd: "1.000",
  baseUnit: piece,
  baseUnitId: piece.id,
});

export function makeCustomersOrdersStore(
  overrides: Partial<CustomersOrdersStore> = {},
): CustomersOrdersStore {
  const customer = makeCustomer({ id: "customer-1", name: "Amel Trabelsi" });
  return {
    session: makePosSession(),
    customers: [
      customer,
      makeCustomer({
        id: "customer-2",
        name: "Boulangerie Voisine",
        phone: "71 111 111",
      }),
    ],
    sales: [
      makeSale({
        id: "sale-1",
        reference: "VT-000001",
        customerId: customer.id,
        totalTnd: "30.000",
        remainingDueTnd: "30.000",
      }),
    ],
    payments: [],
    orders: [
      makeOrder({
        id: "order-1",
        reference: "CMD-000001",
        customer,
        customerId: customer.id,
      }),
    ],
    ...overrides,
  };
}

let sequence = 100;

function allocatedTo(store: CustomersOrdersStore, saleId: string): Decimal {
  return store.payments
    .filter((payment) => !payment.reversedAt)
    .flatMap((payment) => payment.allocations)
    .filter((allocation) => allocation.saleId === saleId)
    .reduce(
      (sum, allocation) => sum.plus(allocation.amountTnd),
      new Decimal(0),
    );
}

function saleBalance(store: CustomersOrdersStore, sale: SaleSummary): Decimal {
  return sale.status === "POSTED"
    ? new Decimal(sale.remainingDueTnd).minus(allocatedTo(store, sale.id))
    : new Decimal(0);
}

function receivable(store: CustomersOrdersStore, customerId: string): Decimal {
  return store.sales
    .filter((sale) => sale.customerId === customerId)
    .reduce((sum, sale) => sum.plus(saleBalance(store, sale)), new Decimal(0));
}

function advanceBalance(
  store: CustomersOrdersStore,
  customerId: string,
): Decimal {
  return store.orders
    .filter(
      (order) =>
        order.customerId === customerId && openStatuses.has(order.status),
    )
    .reduce((sum, order) => sum.plus(order.advanceBalanceTnd), new Decimal(0));
}

function balanceRow(store: CustomersOrdersStore, customer: Customer) {
  const open = store.sales.filter(
    (sale) =>
      sale.customerId === customer.id &&
      saleBalance(store, sale).greaterThan(0),
  );
  return {
    customer,
    balanceTnd: receivable(store, customer.id).toFixed(3),
    advanceBalanceTnd: advanceBalance(store, customer.id).toFixed(3),
    openSaleCount: open.length,
    openOrderCount: store.orders.filter(
      (order) =>
        order.customerId === customer.id && openStatuses.has(order.status),
    ).length,
    openSales: open.map((sale) => ({
      saleId: sale.id,
      soldAt: sale.soldAt,
      balanceTnd: saleBalance(store, sale).toFixed(3),
      paymentState: sale.paymentState,
    })),
  };
}

function withSaleState(
  store: CustomersOrdersStore,
  sale: SaleSummary,
): SaleSummary & { balanceTnd: string } {
  const balance = saleBalance(store, sale);
  return {
    ...sale,
    balanceTnd: balance.toFixed(3),
    paymentState: balance.isZero()
      ? "PAID"
      : balance.lessThan(sale.totalTnd)
        ? "PARTIALLY_PAID"
        : "UNPAID",
  };
}

/// The figures the API states per order (issue #45).
function withFigures(order: Order): Order {
  const received = (order.advances ?? []).reduce(
    (sum, advance) =>
      advance.movement === "RECEIPT"
        ? sum.plus(advance.amountTnd)
        : sum.minus(advance.amountTnd),
    new Decimal(0),
  );
  const remaining =
    order.status === "CANCELLED"
      ? new Decimal(0)
      : order.status === "COMPLETED"
        ? new Decimal(order.sale?.remainingDueTnd ?? 0)
        : new Decimal(order.totalTnd).minus(order.advanceBalanceTnd);
  return {
    ...order,
    advanceReceivedTnd: received.toFixed(3),
    remainingDueTnd: (remaining.lessThan(0)
      ? new Decimal(0)
      : remaining
    ).toFixed(3),
  };
}

function summary(order: Order): Order {
  const { lines, advances, sale, ...rest } = withFigures(order);
  void advances;
  void sale;
  return { ...rest, _count: { lines: lines?.length ?? 0 } };
}

function matchesScope(
  order: Order,
  customerId: string | null,
  q: string | null,
): boolean {
  const needle = q?.trim().toLowerCase();
  return (
    (!customerId || order.customerId === customerId) &&
    (!needle ||
      order.reference.toLowerCase().includes(needle) ||
      order.customer.name.toLowerCase().includes(needle))
  );
}

export function customersOrdersHandlers(
  store: CustomersOrdersStore = makeCustomersOrdersStore(),
) {
  return [
    http.get(`${apiV1}/pos/sessions/current`, () =>
      ok({ session: store.session }),
    ),
    http.get(`${apiV1}/pos/products`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
      return ok(
        makePage(
          [bread, croissant].filter((product) =>
            product.name.toLowerCase().includes(q),
          ),
        ),
      );
    }),
    http.get(`${apiV1}/customer-balances`, ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      const isActive = url.searchParams.get("isActive");
      return ok(
        makePage(
          store.customers
            .filter(
              (customer) =>
                (customer.name.toLowerCase().includes(q) ||
                  (customer.phone ?? "").includes(q)) &&
                (isActive === null ||
                  customer.isActive === (isActive === "true")),
            )
            .map((customer) => balanceRow(store, customer)),
        ),
      );
    }),
    http.get(`${apiV1}/customers/:id/summary`, ({ params }) => {
      const customer = store.customers.find((row) => row.id === params.id);
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      const orders = store.orders.filter(
        (order) => order.customerId === customer.id,
      );
      const posted = store.sales.filter(
        (sale) => sale.customerId === customer.id && sale.status === "POSTED",
      );
      const sum = (pick: (sale: SaleSummary) => string) =>
        posted
          .reduce((total, sale) => total.plus(pick(sale)), new Decimal(0))
          .toFixed(3);
      const payments = store.payments.filter(
        (payment) => payment.customerId === customer.id && !payment.reversedAt,
      );
      return ok({
        summary: {
          ordersCount: orders.filter((order) => order.status !== "CANCELLED")
            .length,
          openOrdersCount: orders.filter((order) =>
            openStatuses.has(order.status),
          ).length,
          salesCount: posted.length,
          cancelledSalesCount: store.sales.filter(
            (sale) =>
              sale.customerId === customer.id && sale.status === "CANCELLED",
          ).length,
          salesTotalTnd: sum((sale) => sale.totalTnd),
          paidTnd: sum((sale) =>
            new Decimal(sale.totalTnd)
              .minus(saleBalance(store, sale))
              .toFixed(3),
          ),
          dueTnd: receivable(store, customer.id).toFixed(3),
          advanceTnd: advanceBalance(store, customer.id).toFixed(3),
          lastSaleAt: posted[0]?.soldAt ?? null,
          lastPaymentAt: payments[0]?.paidAt ?? null,
        },
      });
    }),
    http.get(`${apiV1}/customers/:id/sales`, ({ params }) => {
      const customer = store.customers.find((row) => row.id === params.id);
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      return ok(
        makePage(
          store.sales
            .filter((sale) => sale.customerId === customer.id)
            .map((sale) => withSaleState(store, sale)),
        ),
      );
    }),
    http.post(`${apiV1}/customers/:id/deactivate`, ({ params }) => {
      const customer = store.customers.find((row) => row.id === params.id);
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      const isActive = false;
      if (customer.isActive === isActive)
        return apiError(
          409,
          isActive ? "CUSTOMER_ALREADY_ACTIVE" : "CUSTOMER_ALREADY_INACTIVE",
          "Ce client est déjà dans cet état.",
        );
      if (
        !isActive &&
        (!receivable(store, customer.id).isZero() ||
          !advanceBalance(store, customer.id).isZero())
      )
        return apiError(
          409,
          "CUSTOMER_HAS_BALANCE",
          "Ce client a encore un solde ou une avance : réglez-les avant de le désactiver.",
        );
      Object.assign(customer, { isActive, version: customer.version + 1 });
      return ok({ customer });
    }),
    http.post(`${apiV1}/customers/:id/reactivate`, ({ params }) => {
      const customer = store.customers.find((row) => row.id === params.id);
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      const isActive = true;
      if (customer.isActive === isActive)
        return apiError(
          409,
          isActive ? "CUSTOMER_ALREADY_ACTIVE" : "CUSTOMER_ALREADY_INACTIVE",
          "Ce client est déjà dans cet état.",
        );
      if (
        !isActive &&
        (!receivable(store, customer.id).isZero() ||
          !advanceBalance(store, customer.id).isZero())
      )
        return apiError(
          409,
          "CUSTOMER_HAS_BALANCE",
          "Ce client a encore un solde ou une avance : réglez-les avant de le désactiver.",
        );
      Object.assign(customer, { isActive, version: customer.version + 1 });
      return ok({ customer });
    }),
    http.get(`${apiV1}/customers/:id/statement`, ({ params }) => {
      const customer = store.customers.find((row) => row.id === params.id);
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      const sales = store.sales
        .filter((sale) => sale.customerId === customer.id)
        .map((sale) => withSaleState(store, sale));
      const payments = store.payments.filter(
        (payment) => payment.customerId === customer.id,
      );
      const ledgerEntries = [
        ...sales
          .filter((sale) => Number(sale.remainingDueTnd) > 0)
          .map((sale) => ({
            id: `le-${sale.id}`,
            balanceKind: "RECEIVABLE" as const,
            entryType: "SALE_RECEIVABLE",
            amountTnd: sale.remainingDueTnd,
            occurredAt: sale.soldAt,
            saleId: sale.id,
            orderId: null,
            paymentId: null,
          })),
        ...payments.map((payment) => ({
          id: `le-${payment.id}`,
          balanceKind: "RECEIVABLE" as const,
          entryType: "CUSTOMER_PAYMENT",
          amountTnd: `-${payment.amountTnd}`,
          occurredAt: payment.paidAt,
          saleId: null,
          orderId: null,
          paymentId: payment.id,
        })),
      ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const balance = receivable(store, customer.id).toFixed(3);
      return ok({
        statement: {
          customer,
          balanceTnd: balance,
          advanceBalanceTnd: advanceBalance(store, customer.id).toFixed(3),
          sales,
          orders: [],
          ledgerEntries,
          payments,
          meta: {
            openingBalanceTnd: "0.000",
            closingBalanceTnd: balance,
            nextCursor: null,
            basis: "Solde = ventes à crédit − règlements",
            hasMoreSales: false,
            hasMorePayments: false,
          },
        },
      });
    }),
    http.get(`${apiV1}/customers/:id`, ({ params }) => {
      const customer = store.customers.find((row) => row.id === params.id);
      return customer
        ? ok({
            customer: {
              ...customer,
              balanceTnd: receivable(store, customer.id).toFixed(3),
              advanceBalanceTnd: advanceBalance(store, customer.id).toFixed(3),
            },
          })
        : apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
    }),
    http.post(`${apiV1}/customers`, async ({ request }) => {
      const body = (await request.json()) as Partial<Customer>;
      if (!body.name)
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          { name: "Ce champ est obligatoire." },
        );
      sequence += 1;
      const customer = makeCustomer({
        ...body,
        id: `customer-${sequence}`,
        version: 1,
      });
      store.customers.push(customer);
      return ok({ customer }, 201);
    }),
    http.patch(`${apiV1}/customers/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<Customer> & {
        version: number;
      };
      const customer = store.customers.find((row) => row.id === params.id);
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      if (body.version !== customer.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette fiche a été modifiée. Rechargez puis réessayez.",
        );
      Object.assign(customer, body, { version: customer.version + 1 });
      return ok({ customer });
    }),
    http.get(`${apiV1}/customer-payments`, ({ request }) => {
      const customerId = new URL(request.url).searchParams.get("customerId");
      return ok(
        makePage(
          store.payments
            .filter(
              (payment) => !customerId || payment.customerId === customerId,
            )
            .map((payment) => ({
              ...payment,
              allocations: payment.allocations.map((allocation) => ({
                ...allocation,
                sale: store.sales.find((sale) => sale.id === allocation.saleId),
              })),
            })),
        ),
      );
    }),
    http.post(`${apiV1}/customer-payments`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as CustomerPaymentInput;
      const customer = store.customers.find(
        (row) => row.id === body.customerId,
      );
      if (!customer)
        return apiError(404, "CUSTOMER_NOT_FOUND", "Client introuvable.");
      if (
        new Decimal(body.amountTnd).greaterThan(receivable(store, customer.id))
      )
        return apiError(
          409,
          "CUSTOMER_OVERPAYMENT_REJECTED",
          "Le règlement dépasse le reste à payer du client.",
        );
      if (body.collectedAtPos && !store.session)
        return apiError(
          409,
          "POS_SESSION_NOT_OPEN",
          "Ouvrez une session de caisse avant cette opération.",
        );
      // Like the server: explicit allocations first, the remainder on the
      // oldest open sales, and allocations above the amount refused.
      const requestedTotal = body.allocations.reduce(
        (sum, allocation) => sum.plus(allocation.amountTnd),
        new Decimal(0),
      );
      if (requestedTotal.greaterThan(body.amountTnd))
        return apiError(
          400,
          "PAYMENT_ALLOCATION_EXCEEDS_AMOUNT",
          "La somme des affectations dépasse le montant payé.",
        );
      const planned = new Map(
        body.allocations.map((allocation) => [
          allocation.saleId,
          new Decimal(allocation.amountTnd),
        ]),
      );
      let remainder = new Decimal(body.amountTnd).minus(requestedTotal);
      const openSales = store.sales
        .filter(
          (sale) =>
            sale.customerId === customer.id &&
            saleBalance(store, sale).greaterThan(0),
        )
        .sort((left, right) => left.soldAt.localeCompare(right.soldAt));
      for (const sale of openSales) {
        if (!remainder.greaterThan(0)) break;
        const available = saleBalance(store, sale).minus(
          planned.get(sale.id) ?? 0,
        );
        if (!available.greaterThan(0)) continue;
        const take = available.lessThan(remainder) ? available : remainder;
        planned.set(
          sale.id,
          (planned.get(sale.id) ?? new Decimal(0)).plus(take),
        );
        remainder = remainder.minus(take);
      }
      sequence += 1;
      const payment = makeCustomerPayment({
        id: `cpayment-${sequence}`,
        customer,
        customerId: customer.id,
        sessionId: body.collectedAtPos ? (store.session?.id ?? null) : null,
        amountTnd: new Decimal(body.amountTnd).toFixed(3),
        paidAt: new Date(body.paidAt).toISOString(),
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        allocations: openSales
          .filter((sale) => planned.has(sale.id))
          .map((sale, index) => ({
            id: `calloc-${sequence}-${index}`,
            paymentId: `cpayment-${sequence}`,
            saleId: sale.id,
            amountTnd: (planned.get(sale.id) ?? new Decimal(0)).toFixed(3),
          })),
      });
      store.payments.unshift(payment);
      return ok(
        {
          payment,
          allocations: payment.allocations.map((allocation) => ({
            saleId: allocation.saleId,
            amountTnd: allocation.amountTnd,
          })),
        },
        201,
      );
    }),
    http.post(
      `${apiV1}/customer-payments/:paymentId/reverse`,
      async ({ params, request }) => {
        if (!request.headers.get("Idempotency-Key"))
          return apiError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Une clé d'idempotence est requise.",
          );
        const body = (await request.json()) as { reason?: string };
        const payment = store.payments.find(
          (row) => row.id === params.paymentId,
        );
        if (!payment)
          return apiError(
            404,
            "CUSTOMER_PAYMENT_NOT_FOUND",
            "Règlement introuvable.",
          );
        if (payment.reversedAt)
          return apiError(
            409,
            "PAYMENT_ALREADY_REVERSED",
            "Ce règlement a déjà été annulé.",
          );
        if (payment.sessionId && !store.session)
          return apiError(
            409,
            "POS_SESSION_NOT_OPEN",
            "Ouvrez une session de caisse avant cette opération.",
          );
        Object.assign(payment, {
          reversedAt: new Date().toISOString(),
          reversalReason: body.reason ?? null,
        });
        return ok({ payment }, 201);
      },
    ),
    http.get(`${apiV1}/orders/summary`, ({ request }) => {
      const url = new URL(request.url);
      const customerId = url.searchParams.get("customerId");
      const q = url.searchParams.get("q");
      const dueAfter = url.searchParams.get("dueAfter");
      const dueBefore = url.searchParams.get("dueBefore");
      const now = Date.now();
      const inScope = store.orders.filter((order) =>
        matchesScope(order, customerId, q),
      );
      const inWindow = inScope.filter(
        (order) =>
          (!dueAfter ||
            order.requestedFulfillmentAt >= new Date(dueAfter).toISOString()) &&
          (!dueBefore ||
            order.requestedFulfillmentAt <= new Date(dueBefore).toISOString()),
      );
      const open = inWindow.filter((order) => openStatuses.has(order.status));
      const sum = (rows: Order[], pick: (order: Order) => string) =>
        rows.reduce((total, row) => total.plus(pick(row)), new Decimal(0));
      const today = new Date(now).toISOString().slice(0, 10);
      return ok({
        summary: {
          count: inWindow.length,
          openCount: open.length,
          readyCount: inWindow.filter((order) => order.status === "READY")
            .length,
          completedCount: inWindow.filter(
            (order) => order.status === "COMPLETED",
          ).length,
          cancelledCount: inWindow.filter(
            (order) => order.status === "CANCELLED",
          ).length,
          overdueCount: inScope.filter(
            (order) =>
              openStatuses.has(order.status) &&
              new Date(order.requestedFulfillmentAt).getTime() < now,
          ).length,
          dueTodayCount: inScope.filter(
            (order) =>
              openStatuses.has(order.status) &&
              order.requestedFulfillmentAt.startsWith(today),
          ).length,
          openTotalTnd: sum(open, (order) => order.totalTnd).toFixed(3),
          advanceHeldTnd: sum(open, (order) => order.advanceBalanceTnd).toFixed(
            3,
          ),
          remainingTnd: sum(open, (order) => order.totalTnd)
            .minus(sum(open, (order) => order.advanceBalanceTnd))
            .toFixed(3),
          completedTotalTnd: sum(
            inWindow.filter((order) => order.status === "COMPLETED"),
            (order) => order.totalTnd,
          ).toFixed(3),
        },
      });
    }),
    http.get(`${apiV1}/orders`, ({ request }) => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const customerId = url.searchParams.get("customerId");
      const q = url.searchParams.get("q");
      const dueState = url.searchParams.get("dueState");
      const dueAfter = url.searchParams.get("dueAfter");
      const dueBefore = url.searchParams.get("dueBefore");
      const now = Date.now();
      const rows = store.orders
        .filter(
          (order) =>
            (!status || order.status === status) &&
            matchesScope(order, customerId, q),
        )
        .filter(
          (order) =>
            !dueState ||
            (openStatuses.has(order.status) &&
              (dueState === "OVERDUE"
                ? new Date(order.requestedFulfillmentAt).getTime() < now
                : new Date(order.requestedFulfillmentAt).getTime() >= now)),
        )
        .filter(
          (order) =>
            (!dueAfter ||
              order.requestedFulfillmentAt >=
                new Date(dueAfter).toISOString()) &&
            (!dueBefore ||
              order.requestedFulfillmentAt <=
                new Date(dueBefore).toISOString()),
        )
        .sort((a, b) =>
          a.requestedFulfillmentAt.localeCompare(b.requestedFulfillmentAt),
        )
        .map(summary);
      return ok(makePage(rows));
    }),
    http.post(`${apiV1}/orders`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as OrderInput;
      const customer = store.customers.find(
        (row) => row.id === body.customerId,
      );
      if (!customer)
        return apiError(
          400,
          "ACTIVE_CUSTOMER_REQUIRED",
          "Un client actif est requis.",
        );
      sequence += 1;
      const lines = body.lines.map((line, index) => {
        const product =
          [bread, croissant].find(
            (candidate) => candidate.id === line.productId,
          ) ?? bread;
        return {
          id: `oline-${sequence}-${index}`,
          productId: product.id,
          unitId: product.baseUnitId,
          quantity: new Decimal(line.quantity).toFixed(6),
          unitPriceTnd: product.salePriceTnd,
          lineTotalTnd: new Decimal(line.quantity)
            .times(product.salePriceTnd)
            .toFixed(3),
          productNameSnapshot: product.name,
          unitNameSnapshot: product.baseUnit.name,
        };
      });
      const order = makeOrder({
        id: `order-${sequence}`,
        reference: `CMD-${String(sequence).padStart(6, "0")}`,
        customer,
        customerId: customer.id,
        status: "DRAFT",
        requestedFulfillmentAt: new Date(
          body.requestedFulfillmentAt,
        ).toISOString(),
        totalTnd: lines
          .reduce((sum, line) => sum.plus(line.lineTotalTnd), new Decimal(0))
          .toFixed(3),
        notes: body.notes ?? null,
        lines,
      });
      store.orders.unshift(order);
      return ok({ order: withFigures(order) }, 201);
    }),
    http.get(`${apiV1}/orders/:id`, ({ params }) => {
      const order = store.orders.find((row) => row.id === params.id);
      return order
        ? ok({ order: withFigures(order) })
        : apiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
    }),
    http.post(`${apiV1}/orders/:id/status`, async ({ params, request }) => {
      const body = (await request.json()) as {
        version: number;
        status: Order["status"];
      };
      const order = store.orders.find((row) => row.id === params.id);
      if (!order)
        return apiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
      if (body.version !== order.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette commande a été modifiée. Rechargez puis réessayez.",
        );
      Object.assign(order, {
        status: body.status,
        version: order.version + 1,
      });
      return ok({ order: withFigures(order) });
    }),
    http.post(`${apiV1}/orders/:id/advances`, async ({ params, request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as {
        amountTnd: string;
        paidAt: string;
        notes?: string;
      };
      const order = store.orders.find((row) => row.id === params.id);
      if (!order)
        return apiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
      if (!store.session)
        return apiError(
          409,
          "POS_SESSION_NOT_OPEN",
          "Ouvrez une session de caisse avant cette opération.",
        );
      if (
        new Decimal(order.advanceBalanceTnd)
          .plus(body.amountTnd)
          .greaterThan(order.totalTnd)
      )
        return apiError(
          400,
          "ORDER_ADVANCE_EXCEEDS_TOTAL",
          "L'acompte dépasse le total de la commande.",
        );
      sequence += 1;
      const advance = {
        id: `advance-${sequence}`,
        movement: "RECEIPT" as const,
        amountTnd: new Decimal(body.amountTnd).toFixed(3),
        paidAt: new Date(body.paidAt).toISOString(),
        notes: body.notes ?? null,
      };
      order.advances = [...(order.advances ?? []), advance];
      order.advanceBalanceTnd = new Decimal(order.advanceBalanceTnd)
        .plus(advance.amountTnd)
        .toFixed(3);
      order.version += 1;
      return ok({ order: withFigures(order), advance }, 201);
    }),
    http.post(`${apiV1}/orders/:id/complete`, async ({ params, request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as {
        completedAt: string;
        paidAmountTnd?: string;
      };
      if (body.paidAmountTnd === undefined)
        return apiError(400, "VALIDATION_ERROR", "Indiquez le montant payé.", {
          paidAmountTnd: "Indiquez le montant payé.",
        });
      const order = store.orders.find((row) => row.id === params.id);
      if (!order)
        return apiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
      if (order.saleId || !openStatuses.has(order.status))
        return apiError(
          409,
          "ORDER_NOT_COMPLETABLE",
          "Cette commande ne peut pas être terminée.",
        );
      if (!store.session)
        return apiError(
          409,
          "POS_SESSION_NOT_OPEN",
          "Ouvrez une session de caisse avant cette opération.",
        );
      const paid = new Decimal(body.paidAmountTnd ?? 0);
      const remaining = new Decimal(order.totalTnd)
        .minus(order.advanceBalanceTnd)
        .minus(paid);
      if (remaining.lessThan(0))
        return apiError(
          409,
          "SALE_OVERPAYMENT_REJECTED",
          "Le montant payé dépasse le reste dû.",
        );
      sequence += 1;
      const sale = makeSale({
        id: `sale-${sequence}`,
        reference: `VT-${String(sequence).padStart(6, "0")}`,
        customerId: order.customerId,
        soldAt: new Date(body.completedAt).toISOString(),
        totalTnd: order.totalTnd,
        paidAmountTnd: new Decimal(order.advanceBalanceTnd)
          .plus(paid)
          .toFixed(3),
        remainingDueTnd: remaining.toFixed(3),
        paymentState: remaining.isZero()
          ? "PAID"
          : paid.plus(order.advanceBalanceTnd).greaterThan(0)
            ? "PARTIALLY_PAID"
            : "UNPAID",
      });
      store.sales.unshift(sale);
      Object.assign(order, {
        status: "COMPLETED",
        saleId: sale.id,
        completedAt: sale.soldAt,
        advanceBalanceTnd: "0.000",
        version: order.version + 1,
        sale: {
          ...sale,
          lines: (order.lines ?? []).map((line) => ({
            id: line.id,
            productNameSnapshot: line.productNameSnapshot,
            quantity: line.quantity,
            lineTotalTnd: line.lineTotalTnd,
          })),
        },
      });
      return ok({ order: withFigures(order) }, 201);
    }),
    http.post(`${apiV1}/orders/:id/cancel`, async ({ params, request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as {
        cancelledAt: string;
        reason: string;
        advanceDisposition?: AdvanceDisposition;
      };
      const order = store.orders.find((row) => row.id === params.id);
      if (!order)
        return apiError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
      if (!openStatuses.has(order.status))
        return apiError(
          409,
          "ORDER_NOT_CANCELLABLE",
          "Cette commande ne peut pas être annulée.",
        );
      if (Number(order.advanceBalanceTnd) > 0 && !body.advanceDisposition)
        return apiError(
          400,
          "ORDER_ADVANCE_DISPOSITION_REQUIRED",
          "Indiquez le sort de l'acompte.",
        );
      Object.assign(order, {
        status: "CANCELLED",
        cancelledAt: new Date(body.cancelledAt).toISOString(),
        cancellationReason: body.reason,
        advanceDisposition: body.advanceDisposition ?? null,
        version: order.version + 1,
      });
      return ok({ order: withFigures(order) });
    }),
  ];
}
