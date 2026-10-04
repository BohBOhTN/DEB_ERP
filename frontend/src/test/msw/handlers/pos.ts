import Decimal from "decimal.js-light";
import { http, HttpResponse } from "msw";
import type { Customer } from "../../../features/customers/customers.api.js";
import type {
  PosSession,
  Sale,
  SaleInput,
} from "../../../features/pos/pos.api.js";
import { makeCustomer } from "../../factories/customers.js";
import { makePage } from "../../factories/page.js";
import { makePosSession, makeSale, posProducts } from "../../factories/pos.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// In-memory till: one terminal, at most one open session, sales that
/// count cash into the session and credit into the customer, and the
/// idempotency replay a lost response relies on (AS-019).
export interface PosStore {
  session: PosSession | null;
  sessions: PosSession[];
  customers: Customer[];
  sales: Sale[];
  /// Idempotency keys already used for a sale, so a retry replays it.
  saleKeys: Map<string, string>;
  /// Simulate a lost response: the next sale post commits then fails.
  dropNextSaleResponse: boolean;
}

export function makePosStore(overrides: Partial<PosStore> = {}): PosStore {
  return {
    session: null,
    sessions: [],
    customers: [makeCustomer({ id: "customer-1", name: "Amel Trabelsi" })],
    sales: [],
    saleKeys: new Map(),
    dropNextSaleResponse: false,
    ...overrides,
  };
}

let sequence = 100;

/// The list and the summary share the same filters: posted sales unless a
/// status is asked for, the customer, the session, the paid state, the
/// business days and the search (issue #44).
function saleRows(store: PosStore, url: URL, allStatuses: boolean): Sale[] {
  const customerId = url.searchParams.get("customerId");
  const sessionId = url.searchParams.get("sessionId");
  const paymentState = url.searchParams.get("paymentState");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return store.sales.filter(
    (sale) =>
      (allStatuses && !status ? true : sale.status === (status ?? "POSTED")) &&
      (!customerId || sale.customerId === customerId) &&
      (!sessionId || sale.sessionId === sessionId) &&
      (!paymentState || sale.paymentState === paymentState) &&
      (!from || sale.soldAt.slice(0, 10) >= from) &&
      (!to || sale.soldAt.slice(0, 10) <= to) &&
      (!q ||
        sale.reference.toLowerCase().includes(q) ||
        (sale.customer?.name.toLowerCase().includes(q) ?? false)),
  );
}

function totalsOf(store: PosStore, sessionId: string) {
  const sales = store.sales.filter(
    (sale) => sale.sessionId === sessionId && sale.status === "POSTED",
  );
  return {
    salesCount: sales.length,
    salesTotalTnd: sales
      .reduce((sum, sale) => sum.plus(sale.totalTnd), new Decimal(0))
      .toFixed(3),
    creditGrantedTnd: sales
      .reduce((sum, sale) => sum.plus(sale.remainingDueTnd), new Decimal(0))
      .toFixed(3),
    cashCollectedTnd: sales
      .reduce((sum, sale) => sum.plus(sale.paidAmountTnd), new Decimal(0))
      .toFixed(3),
    advancesReceivedTnd: "0.000",
    advancesRefundedTnd: "0.000",
    customerPaymentsTnd: "0.000",
    customerPaymentReversalsTnd: "0.000",
    saleRefundsTnd: "0.000",
  };
}

/// The session insights as the server computes them: the posted sales of
/// the session by Tunis hour (UTC+1) and its products by revenue.
function insightsOf(store: PosStore, sessionId: string) {
  const sales = store.sales.filter((sale) => sale.sessionId === sessionId);
  const posted = sales.filter((sale) => sale.status === "POSTED");
  const hours = new Map<number, { count: number; total: Decimal }>();
  const products = new Map<
    string,
    { name: string; unitName: string; quantity: Decimal; revenue: Decimal }
  >();

  for (const sale of posted) {
    const hour = (new Date(sale.soldAt).getUTCHours() + 1) % 24;
    const slot = hours.get(hour) ?? { count: 0, total: new Decimal(0) };
    hours.set(hour, {
      count: slot.count + 1,
      total: slot.total.plus(sale.totalTnd),
    });

    for (const line of sale.lines ?? []) {
      const row = products.get(line.productId) ?? {
        name: line.productNameSnapshot,
        unitName: line.unitNameSnapshot,
        quantity: new Decimal(0),
        revenue: new Decimal(0),
      };
      products.set(line.productId, {
        ...row,
        quantity: row.quantity.plus(line.quantity),
        revenue: row.revenue.plus(line.lineTotalTnd),
      });
    }
  }

  const total = posted.reduce(
    (sum, sale) => sum.plus(sale.totalTnd),
    new Decimal(0),
  );

  return {
    averageBasketTnd:
      posted.length === 0 ? null : total.dividedBy(posted.length).toFixed(3),
    cancelledSalesCount: sales.length - posted.length,
    hourly: [...hours.entries()]
      .sort(([left], [right]) => left - right)
      .map(([hour, slot]) => ({
        hour,
        count: slot.count,
        totalTnd: slot.total.toFixed(3),
      })),
    topProducts: [...products.entries()]
      .sort(([, left], [, right]) => right.revenue.comparedTo(left.revenue))
      .slice(0, 5)
      .map(([productId, row]) => ({
        productId,
        name: row.name,
        unitName: row.unitName,
        quantity: row.quantity.toFixed(6),
        revenueTnd: row.revenue.toFixed(3),
      })),
  };
}

/// The totals of the session history, for the list's status filter.
function sessionsSummaryOf(store: PosStore, url: URL) {
  const status = url.searchParams.get("status");
  const sessions = store.sessions.filter(
    (session) => !status || session.status === status,
  );
  const totals = sessions.map((session) => totalsOf(store, session.id));
  const differences = sessions.map(
    (session) => new Decimal(session.cashDifferenceTnd ?? 0),
  );
  const sum = (values: Decimal[]) =>
    values.reduce((total, value) => total.plus(value), new Decimal(0));
  const shortage = sum(differences.filter((value) => value.isNegative()));
  const surplus = sum(differences.filter((value) => value.isPositive()));

  return {
    count: sessions.length,
    openCount: sessions.filter((session) => session.status === "OPEN").length,
    closedCount: sessions.filter((session) => session.status === "CLOSED")
      .length,
    salesCount: totals.reduce((total, row) => total + row.salesCount, 0),
    salesTotalTnd: sum(
      totals.map((row) => new Decimal(row.salesTotalTnd)),
    ).toFixed(3),
    differenceTnd: shortage.plus(surplus).toFixed(3),
    shortageTnd: shortage.toFixed(3),
    surplusTnd: surplus.toFixed(3),
    withDifferenceCount: differences.filter((value) => !value.isZero()).length,
  };
}

export function posHandlers(store: PosStore = makePosStore()) {
  return [
    http.get(`${apiV1}/pos/sessions/current`, () =>
      ok({ session: store.session }),
    ),
    http.post(`${apiV1}/pos/sessions/open`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      if (store.session)
        return apiError(
          409,
          "POS_SESSION_ALREADY_OPEN",
          "Une session de caisse est déjà ouverte.",
        );
      const body = (await request.json()) as {
        openingCashTnd: string;
        notes?: string;
      };
      sequence += 1;
      store.session = makePosSession({
        id: `session-${sequence}`,
        openingCashTnd: new Decimal(body.openingCashTnd).toFixed(3),
        openedAt: new Date().toISOString(),
        notes: body.notes ?? null,
      });
      store.sessions.unshift(store.session);
      return ok({ session: store.session }, 201);
    }),
    http.post(
      `${apiV1}/pos/sessions/:id/close`,
      async ({ params, request }) => {
        if (!request.headers.get("Idempotency-Key"))
          return apiError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Une clé d'idempotence est requise.",
          );
        const session = store.sessions.find((row) => row.id === params.id);
        if (!session || session.status !== "OPEN")
          return apiError(
            409,
            "POS_SESSION_NOT_OPEN",
            "Aucune session de caisse ouverte.",
          );
        const body = (await request.json()) as {
          countedCashTnd: string;
          notes?: string;
        };
        const totals = totalsOf(store, session.id);
        const expected = new Decimal(session.openingCashTnd).plus(
          totals.cashCollectedTnd,
        );
        const counted = new Decimal(body.countedCashTnd);
        Object.assign(session, {
          status: "CLOSED",
          closedAt: new Date().toISOString(),
          closedByUserId: "user-1",
          closedBy: { id: "user-1", displayName: "Salma Ben Ali" },
          countedCashTnd: counted.toFixed(3),
          expectedCashTnd: expected.toFixed(3),
          cashDifferenceTnd: counted.minus(expected).toFixed(3),
          notes: body.notes ?? session.notes,
        });
        store.session = null;
        return ok({ session }, 201);
      },
    ),
    http.get(`${apiV1}/pos/products`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
      return ok(
        makePage(
          posProducts.filter((product) =>
            product.name.toLowerCase().includes(q),
          ),
        ),
      );
    }),
    http.get(`${apiV1}/pos/customers`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
      return ok(
        makePage(
          store.customers.filter((customer) =>
            customer.name.toLowerCase().includes(q),
          ),
        ),
      );
    }),
    http.post(`${apiV1}/pos/sales`, async ({ request }) => {
      const key = request.headers.get("Idempotency-Key");
      if (!key)
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const replayed = store.saleKeys.get(key);
      if (replayed) {
        const sale = store.sales.find((row) => row.id === replayed);
        return HttpResponse.json(
          { data: { sale }, meta: { correlationId: "test-correlation" } },
          { status: 201, headers: { "Idempotency-Replayed": "true" } },
        );
      }
      if (!store.session)
        return apiError(
          409,
          "POS_SESSION_NOT_OPEN",
          "Ouvrez une session de caisse avant cette opération.",
        );
      const body = (await request.json()) as SaleInput;
      if (!body.lines?.length)
        return apiError(
          400,
          "SALE_LINES_REQUIRED",
          "Ajoutez au moins un article.",
        );
      const lines = body.lines.map((line, index) => {
        const product = posProducts.find(
          (candidate) => candidate.id === line.productId,
        );
        if (!product) throw new Error(`unknown product ${line.productId}`);
        return {
          id: `sline-${sequence}-${index}`,
          productId: product.id,
          quantity: new Decimal(line.quantity).toFixed(6),
          unitPriceTnd: product.salePriceTnd,
          lineTotalTnd: new Decimal(line.quantity)
            .times(product.salePriceTnd)
            .toFixed(3),
          productNameSnapshot: product.name,
          unitNameSnapshot: product.baseUnit.name,
        };
      });
      const total = lines.reduce(
        (sum, line) => sum.plus(line.lineTotalTnd),
        new Decimal(0),
      );
      const requested =
        body.paidAmountTnd === undefined
          ? total
          : new Decimal(body.paidAmountTnd);
      const paid = requested.greaterThan(total) ? total : requested;
      const remaining = total.minus(paid);
      if (remaining.greaterThan(0) && !body.customerId)
        return apiError(
          400,
          "CUSTOMER_REQUIRED_FOR_CREDIT",
          "Un client enregistré est obligatoire pour une vente à crédit.",
        );
      sequence += 1;
      const customer = body.customerId
        ? (store.customers.find((row) => row.id === body.customerId) ?? null)
        : null;
      const sale = makeSale({
        id: `sale-${sequence}`,
        reference: `VT-${String(sequence).padStart(6, "0")}`,
        sessionId: store.session.id,
        customerId: customer?.id ?? null,
        customer,
        paymentState: remaining.isZero()
          ? "PAID"
          : paid.greaterThan(0)
            ? "PARTIALLY_PAID"
            : "UNPAID",
        soldAt: new Date().toISOString(),
        postedAt: new Date().toISOString(),
        totalTnd: total.toFixed(3),
        paidAmountTnd: paid.toFixed(3),
        remainingDueTnd: remaining.toFixed(3),
        lines,
        payments: paid.greaterThan(0)
          ? [
              {
                id: `spay-${sequence}`,
                amountTnd: paid.toFixed(3),
                method: "CASH",
                movement: "RECEIPT" as const,
                paidAt: new Date().toISOString(),
              },
            ]
          : [],
      });
      store.sales.unshift(sale);
      store.saleKeys.set(key, sale.id);
      if (store.dropNextSaleResponse) {
        store.dropNextSaleResponse = false;
        return HttpResponse.error();
      }
      return ok({ sale }, 201);
    }),
    http.get(`${apiV1}/pos/sales/summary`, ({ request }) => {
      const rows = saleRows(store, new URL(request.url), true);
      const posted = rows.filter((sale) => sale.status === "POSTED");
      const sum = (pick: (sale: Sale) => string) =>
        posted
          .reduce((total, sale) => total.plus(pick(sale)), new Decimal(0))
          .toFixed(3);
      return ok({
        summary: {
          count: posted.length,
          paidCount: posted.filter((sale) => sale.paymentState === "PAID")
            .length,
          partiallyPaidCount: posted.filter(
            (sale) => sale.paymentState === "PARTIALLY_PAID",
          ).length,
          unpaidCount: posted.filter((sale) => sale.paymentState === "UNPAID")
            .length,
          cancelledCount: rows.filter((sale) => sale.status === "CANCELLED")
            .length,
          totalTnd: sum((sale) => sale.totalTnd),
          paidTnd: sum((sale) => sale.paidAmountTnd),
          remainingTnd: sum((sale) => sale.remainingDueTnd),
        },
      });
    }),
    http.post(`${apiV1}/pos/sales/:id/cancel`, async ({ params, request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as { reason?: string };
      const sale = store.sales.find((row) => row.id === params.id);
      if (!sale) return apiError(404, "SALE_NOT_FOUND", "Vente introuvable.");
      if (sale.status !== "POSTED")
        return apiError(
          409,
          "SALE_ALREADY_CANCELLED",
          "Cette vente est déjà annulée.",
        );
      if (sale.order)
        return apiError(
          409,
          "SALE_LINKED_TO_ORDER",
          "Cette vente provient d'une commande terminée et ne peut pas être annulée ici.",
        );
      const cash = (sale.payments ?? [])
        .filter((payment) => payment.movement === "RECEIPT")
        .reduce((sum, payment) => sum.plus(payment.amountTnd), new Decimal(0));
      if (cash.greaterThan(0) && !store.session)
        return apiError(
          409,
          "POS_SESSION_NOT_OPEN",
          "Ouvrez une session de caisse pour rembourser les espèces de cette vente.",
        );
      sequence += 1;
      Object.assign(sale, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancellationReason: body.reason ?? null,
        cancelledBy: { id: "user-1", displayName: "Salma Ben Ali" },
        payments: [
          ...(sale.payments ?? []),
          ...(cash.greaterThan(0)
            ? [
                {
                  id: `spay-${sequence}`,
                  amountTnd: cash.toFixed(3),
                  method: "CASH" as const,
                  movement: "REFUND" as const,
                  paidAt: new Date().toISOString(),
                },
              ]
            : []),
        ],
      });
      return ok({ sale }, 201);
    }),
    http.get(`${apiV1}/pos/sales`, ({ request }) => {
      return ok(
        makePage(
          saleRows(store, new URL(request.url), false).map(
            ({ lines, payments, ...sale }) => ({
              ...sale,
              lines: undefined,
              payments: undefined,
              ...(lines ? {} : {}),
              ...(payments ? {} : {}),
            }),
          ),
        ),
      );
    }),
    http.get(`${apiV1}/pos/sales/:id`, ({ params }) => {
      const sale = store.sales.find((row) => row.id === params.id);
      return sale
        ? ok({
            sale: {
              ...sale,
              session: store.sessions.find((row) => row.id === sale.sessionId),
            },
          })
        : apiError(404, "SALE_NOT_FOUND", "Vente introuvable.");
    }),
    http.get(`${apiV1}/pos/sessions`, () =>
      ok(
        makePage(
          store.sessions.map((session) => ({
            ...session,
            ...totalsOf(store, session.id),
          })),
        ),
      ),
    ),
    // Ahead of `:id`, which would otherwise take "summary" for a session.
    http.get(`${apiV1}/pos/sessions/summary`, ({ request }) =>
      ok({ summary: sessionsSummaryOf(store, new URL(request.url)) }),
    ),
    http.get(`${apiV1}/pos/sessions/:id`, ({ params }) => {
      const session = store.sessions.find((row) => row.id === params.id);
      return session
        ? ok({
            session,
            totals: totalsOf(store, session.id),
            insights: insightsOf(store, session.id),
          })
        : apiError(
            404,
            "POS_SESSION_NOT_FOUND",
            "Session de caisse introuvable.",
          );
    }),
  ];
}
