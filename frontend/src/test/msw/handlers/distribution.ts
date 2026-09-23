import Decimal from "decimal.js-light";
import { http } from "msw";
import type {
  DirectSaleInput,
  DispatchInput,
  Distributor,
  DistributorPayment,
  DistributorPaymentInput,
  DistributorSale,
  Dispatch,
  Settlement,
  SettlementInput,
} from "../../../features/distribution/distribution.api.js";
import {
  makeDispatch,
  makeDistributor,
  makeDistributorPayment,
  makeDistributorSale,
  makeSettlement,
} from "../../factories/distribution.js";
import { makePage } from "../../factories/page.js";
import { posProducts } from "../../factories/pos.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// In-memory distribution: custody per dispatch line as the quantity
/// equation, receivables from posted sales and settlements minus payment
/// allocations, like the distributor ledger.
export interface DistributionStore {
  distributors: Distributor[];
  dispatches: Dispatch[];
  settlements: Settlement[];
  sales: DistributorSale[];
  payments: DistributorPayment[];
}

export function makeDistributionStore(
  overrides: Partial<DistributionStore> = {},
): DistributionStore {
  const karim = makeDistributor({
    id: "distributor-1",
    name: "Karim Distribution",
  });
  return {
    distributors: [
      karim,
      makeDistributor({
        id: "distributor-2",
        name: "Sana Épicerie",
        phone: "51 111 111",
      }),
    ],
    dispatches: [
      makeDispatch({
        id: "dispatch-1",
        reference: "BL-000001",
        distributor: karim,
        distributorId: karim.id,
      }),
    ],
    settlements: [],
    sales: [],
    payments: [],
    ...overrides,
  };
}

let sequence = 100;
const d = (value: string | number | undefined) => new Decimal(value ?? 0);

function allocated(
  store: DistributionStore,
  key: "saleId" | "settlementId",
  id: string,
): Decimal {
  return store.payments
    .flatMap((payment) => payment.allocations)
    .filter((allocation) => allocation[key] === id)
    .reduce(
      (sum, allocation) => sum.plus(allocation.amountTnd),
      new Decimal(0),
    );
}

function docBalance(
  store: DistributionStore,
  doc: { id: string; remainingDueTnd: string },
  key: "saleId" | "settlementId",
): Decimal {
  return d(doc.remainingDueTnd).minus(allocated(store, key, doc.id));
}

function receivable(store: DistributionStore, distributorId: string): Decimal {
  return store.sales
    .filter((sale) => sale.distributorId === distributorId)
    .reduce(
      (sum, sale) => sum.plus(docBalance(store, sale, "saleId")),
      new Decimal(0),
    )
    .plus(
      store.settlements
        .filter((row) => row.distributorId === distributorId)
        .reduce(
          (sum, row) => sum.plus(docBalance(store, row, "settlementId")),
          new Decimal(0),
        ),
    );
}

function heldLines(store: DistributionStore, distributorId: string): number {
  return store.dispatches
    .filter(
      (dispatch) =>
        dispatch.distributorId === distributorId && dispatch.status === "OPEN",
    )
    .reduce((sum, dispatch) => sum + dispatch.lines.length, 0);
}

function withCounts(
  store: DistributionStore,
  distributor: Distributor,
): Distributor {
  return {
    ...distributor,
    balanceTnd: receivable(store, distributor.id).toFixed(3),
    heldLineCount: heldLines(store, distributor.id),
  };
}

function custodyLines(store: DistributionStore, distributorId?: string) {
  return store.dispatches
    .filter(
      (dispatch) => !distributorId || dispatch.distributorId === distributorId,
    )
    .flatMap((dispatch) =>
      dispatch.lines.map((line) => ({
        ...line,
        dispatchReference: dispatch.reference,
        dispatchedAt: dispatch.dispatchedAt,
        distributorId: dispatch.distributorId,
        distributorName: dispatch.distributor.name,
      })),
    )
    .filter(
      (line) =>
        d(line.stillHeldQuantity).greaterThan(0) ||
        d(line.unaccountedQuantity).greaterThan(0),
    );
}

export function distributionHandlers(
  store: DistributionStore = makeDistributionStore(),
) {
  return [
    http.get(`${apiV1}/distributors`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
      return ok(
        makePage(
          store.distributors
            .filter((row) => row.name.toLowerCase().includes(q))
            .map((row) => withCounts(store, row)),
        ),
      );
    }),
    http.post(`${apiV1}/distributors`, async ({ request }) => {
      const body = (await request.json()) as Partial<Distributor>;
      if (!body.name)
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          { name: "Ce champ est obligatoire." },
        );
      sequence += 1;
      const distributor = makeDistributor({
        ...body,
        id: `distributor-${sequence}`,
        version: 1,
      });
      store.distributors.push(distributor);
      return ok({ distributor }, 201);
    }),
    http.get(`${apiV1}/distributors/:id/statement`, ({ params }) => {
      const distributor = store.distributors.find(
        (row) => row.id === params.id,
      );
      if (!distributor)
        return apiError(
          404,
          "DISTRIBUTOR_NOT_FOUND",
          "Distributeur introuvable.",
        );
      const sales = store.sales
        .filter((row) => row.distributorId === distributor.id)
        .map((row) => ({
          ...row,
          balanceTnd: docBalance(store, row, "saleId").toFixed(3),
        }));
      const settlements = store.settlements
        .filter((row) => row.distributorId === distributor.id)
        .map((row) => ({
          ...row,
          balanceTnd: docBalance(store, row, "settlementId").toFixed(3),
        }));
      const payments = store.payments.filter(
        (row) => row.distributorId === distributor.id,
      );
      const ledgerEntries = [
        ...sales.map((row) => ({
          id: `le-${row.id}`,
          entryType: "SALE_RECEIVABLE" as const,
          amountTnd: row.remainingDueTnd,
          occurredAt: row.soldAt,
          saleId: row.id,
          settlementId: null,
          paymentId: null,
        })),
        ...settlements.map((row) => ({
          id: `le-${row.id}`,
          entryType: "SETTLEMENT_RECEIVABLE" as const,
          amountTnd: row.remainingDueTnd,
          occurredAt: row.settledAt,
          saleId: null,
          settlementId: row.id,
          paymentId: null,
        })),
        ...payments.map((row) => ({
          id: `le-${row.id}`,
          entryType: "PAYMENT" as const,
          amountTnd: `-${row.amountTnd}`,
          occurredAt: row.paidAt,
          saleId: null,
          settlementId: null,
          paymentId: row.id,
        })),
      ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const balance = receivable(store, distributor.id).toFixed(3);
      return ok({
        statement: {
          distributor,
          balanceTnd: balance,
          sales,
          settlements,
          ledgerEntries,
          payments,
          meta: {
            openingBalanceTnd: "0.000",
            closingBalanceTnd: balance,
            nextCursor: null,
            basis: "Solde = ventes et règlements validés − paiements",
            hasMoreSales: false,
            hasMoreSettlements: false,
            hasMorePayments: false,
          },
        },
      });
    }),
    http.get(`${apiV1}/distributors/:id`, ({ params }) => {
      const distributor = store.distributors.find(
        (row) => row.id === params.id,
      );
      return distributor
        ? ok({ distributor: withCounts(store, distributor) })
        : apiError(404, "DISTRIBUTOR_NOT_FOUND", "Distributeur introuvable.");
    }),
    http.patch(`${apiV1}/distributors/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<Distributor> & {
        version: number;
      };
      const distributor = store.distributors.find(
        (row) => row.id === params.id,
      );
      if (!distributor)
        return apiError(
          404,
          "DISTRIBUTOR_NOT_FOUND",
          "Distributeur introuvable.",
        );
      if (body.version !== distributor.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette fiche a été modifiée. Rechargez puis réessayez.",
        );
      Object.assign(distributor, body, { version: distributor.version + 1 });
      return ok({ distributor });
    }),
    http.post(`${apiV1}/distributor-sales`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as DirectSaleInput;
      const distributor = store.distributors.find(
        (row) => row.id === body.distributorId,
      );
      if (!distributor)
        return apiError(
          400,
          "ACTIVE_DISTRIBUTOR_REQUIRED",
          "Un distributeur actif est requis.",
        );
      sequence += 1;
      const lines = body.lines.map((line, index) => {
        const product =
          posProducts.find((candidate) => candidate.id === line.productId) ??
          posProducts[0]!;
        return {
          id: `dsl-${sequence}-${index}`,
          productId: product.id,
          quantity: d(line.quantity).toFixed(6),
          unitPriceTnd: d(line.unitPriceTnd).toFixed(3),
          lineTotalTnd: d(line.quantity).times(line.unitPriceTnd).toFixed(3),
          productNameSnapshot: product.name,
          unitNameSnapshot: product.baseUnit.name,
        };
      });
      const total = lines.reduce(
        (sum, line) => sum.plus(line.lineTotalTnd),
        new Decimal(0),
      );
      const paid = d(body.paidAmountTnd);
      if (paid.greaterThan(total))
        return apiError(
          400,
          "DISTRIBUTOR_OVERPAYMENT_REJECTED",
          "Le montant payé dépasse le total.",
        );
      const sale = makeDistributorSale({
        id: `dsale-${sequence}`,
        reference: `VD-${String(sequence).padStart(6, "0")}`,
        distributorId: distributor.id,
        distributor,
        soldAt: new Date(body.soldAt).toISOString(),
        totalTnd: total.toFixed(3),
        paidAmountTnd: paid.toFixed(3),
        remainingDueTnd: total.minus(paid).toFixed(3),
        paymentState: total.minus(paid).isZero()
          ? "PAID"
          : paid.greaterThan(0)
            ? "PARTIALLY_PAID"
            : "UNPAID",
        notes: body.notes ?? null,
        lines,
      });
      store.sales.unshift(sale);
      return ok({ sale }, 201);
    }),
    http.get(`${apiV1}/distributor-dispatches`, ({ request }) => {
      const url = new URL(request.url);
      const distributorId = url.searchParams.get("distributorId");
      const status = url.searchParams.get("status");
      return ok(
        makePage(
          store.dispatches
            .filter(
              (row) =>
                (!distributorId || row.distributorId === distributorId) &&
                (!status || row.status === status),
            )
            .map(({ settlements, ...dispatch }) => ({
              ...dispatch,
              settlements: settlements ? undefined : undefined,
            })),
        ),
      );
    }),
    http.post(`${apiV1}/distributor-dispatches`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as DispatchInput;
      const distributor = store.distributors.find(
        (row) => row.id === body.distributorId,
      );
      if (!distributor)
        return apiError(
          400,
          "ACTIVE_DISTRIBUTOR_REQUIRED",
          "Un distributeur actif est requis.",
        );
      sequence += 1;
      const id = `dispatch-${sequence}`;
      const dispatch = makeDispatch({
        id,
        reference: `BL-${String(sequence).padStart(6, "0")}`,
        distributor,
        distributorId: distributor.id,
        dispatchedAt: new Date(body.dispatchedAt).toISOString(),
        notes: body.notes ?? null,
        lines: body.lines.map((line, index) => {
          const product =
            posProducts.find((candidate) => candidate.id === line.productId) ??
            posProducts[0]!;
          return {
            id: `dline-${sequence}-${index}`,
            dispatchId: id,
            productId: product.id,
            unitId: product.baseUnit.id,
            dispatchedQuantity: d(line.quantity).toFixed(6),
            settledSoldQuantity: "0.000000",
            returnedQuantity: "0.000000",
            unaccountedQuantity: "0.000000",
            stillHeldQuantity: d(line.quantity).toFixed(6),
            productNameSnapshot: product.name,
            unitNameSnapshot: product.baseUnit.name,
          };
        }),
      });
      store.dispatches.unshift(dispatch);
      return ok({ dispatch }, 201);
    }),
    http.get(`${apiV1}/distributor-dispatches/:id`, ({ params }) => {
      const dispatch = store.dispatches.find((row) => row.id === params.id);
      return dispatch
        ? ok({
            dispatch: {
              ...dispatch,
              settlements: store.settlements.filter(
                (row) => row.dispatchId === dispatch.id,
              ),
            },
          })
        : apiError(404, "DISPATCH_NOT_FOUND", "Bon de livraison introuvable.");
    }),
    http.get(`${apiV1}/distributor-settlements`, ({ request }) => {
      const url = new URL(request.url);
      const distributorId = url.searchParams.get("distributorId");
      const dispatchId = url.searchParams.get("dispatchId");
      return ok(
        makePage(
          store.settlements
            .filter(
              (row) =>
                (!distributorId || row.distributorId === distributorId) &&
                (!dispatchId || row.dispatchId === dispatchId),
            )
            .map((row) => ({
              ...row,
              distributor: store.distributors.find(
                (candidate) => candidate.id === row.distributorId,
              ),
              dispatch: store.dispatches.find(
                (candidate) => candidate.id === row.dispatchId,
              ),
            })),
        ),
      );
    }),
    http.post(`${apiV1}/distributor-settlements`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as SettlementInput;
      const dispatch = store.dispatches.find(
        (row) => row.id === body.dispatchId,
      );
      if (!dispatch)
        return apiError(
          404,
          "DISPATCH_NOT_FOUND",
          "Bon de livraison introuvable.",
        );
      if (dispatch.status !== "OPEN")
        return apiError(
          409,
          "DISPATCH_NOT_OPEN",
          "Ce bon de livraison est déjà soldé.",
        );
      sequence += 1;
      const lines = body.lines.map((input, index) => {
        const line = dispatch.lines.find(
          (candidate) => candidate.id === input.dispatchLineId,
        );
        if (!line) throw new Error("unknown dispatch line");
        const sold = d(input.soldQuantity);
        const returned = d(input.returnedQuantity);
        const unaccounted = d(input.unaccountedQuantity);
        if (
          sold
            .plus(returned)
            .plus(unaccounted)
            .greaterThan(line.stillHeldQuantity)
        )
          throw new Error("SETTLEMENT_EXCEEDS_HELD_QUANTITY");
        line.settledSoldQuantity = d(line.settledSoldQuantity)
          .plus(sold)
          .toFixed(6);
        line.returnedQuantity = d(line.returnedQuantity)
          .plus(returned)
          .toFixed(6);
        line.unaccountedQuantity = d(line.unaccountedQuantity)
          .plus(unaccounted)
          .toFixed(6);
        line.stillHeldQuantity = d(line.dispatchedQuantity)
          .minus(line.settledSoldQuantity)
          .minus(line.returnedQuantity)
          .minus(line.unaccountedQuantity)
          .toFixed(6);
        return {
          id: `sline-${sequence}-${index}`,
          dispatchLineId: line.id,
          productId: line.productId,
          soldQuantity: sold.toFixed(6),
          returnedQuantity: returned.toFixed(6),
          unaccountedQuantity: unaccounted.toFixed(6),
          unitPriceTnd: d(input.unitPriceTnd).toFixed(3),
          lineTotalTnd: sold.times(input.unitPriceTnd).toFixed(3),
          productNameSnapshot: line.productNameSnapshot,
          unitNameSnapshot: line.unitNameSnapshot,
        };
      });
      if (dispatch.lines.every((line) => d(line.stillHeldQuantity).isZero()))
        dispatch.status = "CLOSED";
      const total = lines.reduce(
        (sum, line) => sum.plus(line.lineTotalTnd),
        new Decimal(0),
      );
      const paid = d(body.paidAmountTnd);
      const settlement = makeSettlement({
        id: `settlement-${sequence}`,
        reference: `RG-${String(sequence).padStart(6, "0")}`,
        distributorId: dispatch.distributorId,
        dispatchId: dispatch.id,
        settledAt: new Date(body.settledAt).toISOString(),
        totalTnd: total.toFixed(3),
        paidAmountTnd: paid.toFixed(3),
        remainingDueTnd: total.minus(paid).toFixed(3),
        paymentState: total.minus(paid).isZero()
          ? "PAID"
          : paid.greaterThan(0)
            ? "PARTIALLY_PAID"
            : "UNPAID",
        notes: body.notes ?? null,
        lines,
      });
      store.settlements.unshift(settlement);
      return ok({ settlement }, 201);
    }),
    http.get(`${apiV1}/distributor-custody`, ({ request }) => {
      const distributorId =
        new URL(request.url).searchParams.get("distributorId") ?? undefined;
      const items = custodyLines(store, distributorId);
      return ok({
        custody: {
          items,
          discrepancies: items.filter((line) =>
            d(line.unaccountedQuantity).greaterThan(0),
          ),
        },
      });
    }),
    http.get(`${apiV1}/distributor-balances`, ({ request }) => {
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
      return ok(
        makePage(
          store.distributors
            .filter((row) => row.name.toLowerCase().includes(q))
            .map((distributor) => ({
              distributor,
              balanceTnd: receivable(store, distributor.id).toFixed(3),
              lastPaymentAt:
                store.payments.find(
                  (payment) => payment.distributorId === distributor.id,
                )?.paidAt ?? null,
            })),
        ),
      );
    }),
    http.get(`${apiV1}/distributor-payments`, ({ request }) => {
      const distributorId = new URL(request.url).searchParams.get(
        "distributorId",
      );
      return ok(
        makePage(
          store.payments.filter(
            (row) => !distributorId || row.distributorId === distributorId,
          ),
        ),
      );
    }),
    http.post(`${apiV1}/distributor-payments`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as DistributorPaymentInput;
      const distributor = store.distributors.find(
        (row) => row.id === body.distributorId,
      );
      if (!distributor)
        return apiError(
          404,
          "DISTRIBUTOR_NOT_FOUND",
          "Distributeur introuvable.",
        );
      if (d(body.amountTnd).greaterThan(receivable(store, distributor.id)))
        return apiError(
          409,
          "DISTRIBUTOR_OVERPAYMENT_REJECTED",
          "Le paiement dépasse le solde dû du distributeur.",
        );
      sequence += 1;
      const payment = makeDistributorPayment({
        id: `dpayment-${sequence}`,
        distributor,
        distributorId: distributor.id,
        amountTnd: d(body.amountTnd).toFixed(3),
        paidAt: new Date(body.paidAt).toISOString(),
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        allocations: body.allocations.map((allocation, index) => ({
          id: `dalloc-${sequence}-${index}`,
          saleId: allocation.saleId ?? null,
          settlementId: allocation.settlementId ?? null,
          amountTnd: d(allocation.amountTnd).toFixed(3),
        })),
      });
      store.payments.unshift(payment);
      return ok({ payment }, 201);
    }),
  ];
}
