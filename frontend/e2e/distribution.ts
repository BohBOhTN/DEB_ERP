import type { Page, Route } from "@playwright/test";

/// Browser-side distribution mock for the Sprint 24 flow: custody as the
/// quantity equation per line, receivable from settlements minus payments.
interface Line {
  id: string;
  dispatchId: string;
  productId: string;
  unitId: string;
  dispatchedQuantity: string;
  settledSoldQuantity: string;
  returnedQuantity: string;
  unaccountedQuantity: string;
  stillHeldQuantity: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

interface Dispatch {
  id: string;
  reference: string;
  distributorId: string;
  status: "OPEN" | "CLOSED";
  dispatchedAt: string;
  notes: string | null;
  version: number;
  lines: Line[];
}

interface Settlement {
  id: string;
  reference: string;
  distributorId: string;
  dispatchId: string;
  settledAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  paymentState: "PAID" | "PARTIALLY_PAID" | "UNPAID";
  notes: string | null;
  lines: unknown[];
}

export interface DistributionState {
  dispatches: Dispatch[];
  settlements: Settlement[];
  payments: Array<{
    id: string;
    distributorId: string;
    amountTnd: string;
    paidAt: string;
    reference: string | null;
    notes: string | null;
    method: "CASH";
    allocations: Array<{
      id: string;
      saleId: string | null;
      settlementId: string | null;
      amountTnd: string;
    }>;
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
  salePriceTnd: "1.200",
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
const karim = {
  id: "distributor-1",
  name: "Karim Distribution",
  phone: "50 000 000",
  address: null,
  taxIdentifier: null,
  notes: null,
  isActive: true,
  version: 1,
  createdAt: "2026-09-01T08:00:00.000Z",
};

export function makeDistributionState(): DistributionState {
  return { dispatches: [], settlements: [], payments: [] };
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
const qty = (value: number) => value.toFixed(6);
let sequence = 0;

function receivable(state: DistributionState): number {
  const allocated = state.payments
    .flatMap((payment) => payment.allocations)
    .reduce((sum, allocation) => sum + Number(allocation.amountTnd), 0);
  return (
    state.settlements.reduce(
      (sum, row) => sum + Number(row.remainingDueTnd),
      0,
    ) - allocated
  );
}

function heldLines(state: DistributionState): number {
  return state.dispatches
    .filter((dispatch) => dispatch.status === "OPEN")
    .reduce((sum, dispatch) => sum + dispatch.lines.length, 0);
}

function distributorRow(state: DistributionState) {
  return {
    ...karim,
    balanceTnd: money(receivable(state)),
    heldLineCount: heldLines(state),
  };
}

function custody(state: DistributionState) {
  const items = state.dispatches
    .flatMap((dispatch) =>
      dispatch.lines.map((line) => ({
        ...line,
        dispatchReference: dispatch.reference,
        dispatchedAt: dispatch.dispatchedAt,
        distributorId: dispatch.distributorId,
        distributorName: karim.name,
      })),
    )
    .filter(
      (line) =>
        Number(line.stillHeldQuantity) > 0 ||
        Number(line.unaccountedQuantity) > 0,
    );
  return {
    items,
    discrepancies: items.filter((line) => Number(line.unaccountedQuantity) > 0),
  };
}

export async function handleDistribution(
  route: Route,
  state: DistributionState,
): Promise<boolean> {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const method = route.request().method();
  const body = () => route.request().postDataJSON() as Record<string, unknown>;

  if (path === "/pos/products" || path === "/catalog/products")
    return (route.fulfill(page([bread])), true);
  if (path === "/distributors" && method === "GET")
    return (route.fulfill(page([distributorRow(state)])), true);
  if (path === "/distributors/distributor-1/statement") {
    const settlements = state.settlements.map((row) => ({
      ...row,
      balanceTnd: money(
        Number(row.remainingDueTnd) -
          state.payments
            .flatMap((p) => p.allocations)
            .filter((a) => a.settlementId === row.id)
            .reduce((s, a) => s + Number(a.amountTnd), 0),
      ),
    }));
    const balance = money(receivable(state));
    return (
      route.fulfill(
        envelope({
          statement: {
            distributor: karim,
            balanceTnd: balance,
            sales: [],
            settlements,
            ledgerEntries: [],
            payments: state.payments,
            meta: {
              openingBalanceTnd: "0.000",
              closingBalanceTnd: balance,
              nextCursor: null,
              basis: "Solde = règlements − paiements",
              hasMoreSales: false,
              hasMoreSettlements: false,
              hasMorePayments: false,
            },
          },
        }),
      ),
      true
    );
  }
  if (path === "/distributors/distributor-1")
    return (
      route.fulfill(envelope({ distributor: distributorRow(state) })),
      true
    );
  if (path === "/distributor-custody")
    return (route.fulfill(envelope({ custody: custody(state) })), true);
  if (path === "/distributor-balances")
    return (
      route.fulfill(
        page([
          {
            distributor: karim,
            balanceTnd: money(receivable(state)),
            lastPaymentAt: state.payments[0]?.paidAt ?? null,
          },
        ]),
      ),
      true
    );
  if (path === "/distributor-payments" && method === "GET")
    return (
      route.fulfill(
        page(
          state.payments.map((payment) => ({ ...payment, distributor: karim })),
        ),
      ),
      true
    );
  if (path === "/distributor-settlements" && method === "GET")
    return (
      route.fulfill(
        page(
          state.settlements.map((row) => ({
            ...row,
            distributor: karim,
            dispatch: state.dispatches.find((d) => d.id === row.dispatchId),
          })),
        ),
      ),
      true
    );

  if (path === "/distributor-dispatches" && method === "GET")
    return (
      route.fulfill(
        page(
          state.dispatches.map((dispatch) => ({
            ...dispatch,
            distributor: karim,
          })),
        ),
      ),
      true
    );
  if (path === "/distributor-dispatches" && method === "POST") {
    sequence += 1;
    const input = body();
    const id = `dispatch-${sequence}`;
    const dispatch: Dispatch = {
      id,
      reference: `BL-${String(sequence).padStart(6, "0")}`,
      distributorId: karim.id,
      status: "OPEN",
      dispatchedAt: new Date(input.dispatchedAt as string).toISOString(),
      notes: null,
      version: 1,
      lines: (
        input.lines as Array<{ productId: string; quantity: string }>
      ).map((line, index) => ({
        id: `dline-${sequence}-${index}`,
        dispatchId: id,
        productId: line.productId,
        unitId: piece.id,
        dispatchedQuantity: qty(Number(line.quantity)),
        settledSoldQuantity: qty(0),
        returnedQuantity: qty(0),
        unaccountedQuantity: qty(0),
        stillHeldQuantity: qty(Number(line.quantity)),
        productNameSnapshot: bread.name,
        unitNameSnapshot: piece.name,
      })),
    };
    state.dispatches.unshift(dispatch);
    return (
      route.fulfill(
        envelope({ dispatch: { ...dispatch, distributor: karim } }, 201),
      ),
      true
    );
  }
  const dispatchMatch = /^\/distributor-dispatches\/([^/]+)$/.exec(path);
  if (dispatchMatch) {
    const dispatch = state.dispatches.find(
      (row) => row.id === dispatchMatch[1],
    );
    return (
      route.fulfill(
        dispatch
          ? envelope({
              dispatch: {
                ...dispatch,
                distributor: karim,
                settlements: state.settlements.filter(
                  (row) => row.dispatchId === dispatch.id,
                ),
              },
            })
          : failure(404, "DISPATCH_NOT_FOUND", "Bon de livraison introuvable."),
      ),
      true
    );
  }
  if (path === "/distributor-settlements" && method === "POST") {
    const input = body();
    const dispatch = state.dispatches.find(
      (row) => row.id === input.dispatchId,
    );
    if (!dispatch || dispatch.status !== "OPEN")
      return (
        route.fulfill(
          failure(
            409,
            "DISPATCH_NOT_OPEN",
            "Ce bon de livraison est déjà soldé.",
          ),
        ),
        true
      );
    sequence += 1;
    let total = 0;
    for (const line of input.lines as Array<{
      dispatchLineId: string;
      soldQuantity?: string;
      returnedQuantity?: string;
      unaccountedQuantity?: string;
      unitPriceTnd: string;
    }>) {
      const target = dispatch.lines.find(
        (candidate) => candidate.id === line.dispatchLineId,
      );
      if (!target) continue;
      const sold = Number(line.soldQuantity ?? 0);
      const returned = Number(line.returnedQuantity ?? 0);
      const unaccounted = Number(line.unaccountedQuantity ?? 0);
      if (
        sold + returned + unaccounted >
        Number(target.stillHeldQuantity) + 1e-9
      )
        return (
          route.fulfill(
            failure(
              400,
              "SETTLEMENT_EXCEEDS_HELD_QUANTITY",
              "Les quantités dépassent le dépôt.",
            ),
          ),
          true
        );
      target.settledSoldQuantity = qty(
        Number(target.settledSoldQuantity) + sold,
      );
      target.returnedQuantity = qty(Number(target.returnedQuantity) + returned);
      target.unaccountedQuantity = qty(
        Number(target.unaccountedQuantity) + unaccounted,
      );
      target.stillHeldQuantity = qty(
        Number(target.dispatchedQuantity) -
          Number(target.settledSoldQuantity) -
          Number(target.returnedQuantity) -
          Number(target.unaccountedQuantity),
      );
      total += sold * Number(line.unitPriceTnd);
    }
    if (dispatch.lines.every((line) => Number(line.stillHeldQuantity) === 0))
      dispatch.status = "CLOSED";
    const paid = Number(input.paidAmountTnd ?? 0);
    const settlement: Settlement = {
      id: `settlement-${sequence}`,
      reference: `RG-${String(sequence).padStart(6, "0")}`,
      distributorId: karim.id,
      dispatchId: dispatch.id,
      settledAt: new Date(input.settledAt as string).toISOString(),
      totalTnd: money(total),
      paidAmountTnd: money(paid),
      remainingDueTnd: money(total - paid),
      paymentState:
        total - paid <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
      notes: null,
      lines: [],
    };
    state.settlements.unshift(settlement);
    return (route.fulfill(envelope({ settlement }, 201)), true);
  }
  if (path === "/distributor-payments" && method === "POST") {
    const input = body();
    if (Number(input.amountTnd) > receivable(state) + 1e-9)
      return (
        route.fulfill(
          failure(
            409,
            "DISTRIBUTOR_OVERPAYMENT_REJECTED",
            "Le paiement dépasse le solde dû.",
          ),
        ),
        true
      );
    sequence += 1;
    const payment = {
      id: `dpayment-${sequence}`,
      distributorId: karim.id,
      amountTnd: money(Number(input.amountTnd)),
      paidAt: new Date(input.paidAt as string).toISOString(),
      reference: null,
      notes: null,
      method: "CASH" as const,
      allocations: (
        (input.allocations as Array<{
          saleId?: string;
          settlementId?: string;
          amountTnd: string;
        }>) ?? []
      ).map((allocation, index) => ({
        id: `dalloc-${sequence}-${index}`,
        saleId: allocation.saleId ?? null,
        settlementId: allocation.settlementId ?? null,
        amountTnd: money(Number(allocation.amountTnd)),
      })),
    };
    state.payments.unshift(payment);
    return (
      route.fulfill(
        envelope(
          {
            payment: { ...payment, distributor: karim },
            allocations: payment.allocations.map((allocation) => ({
              saleId: allocation.saleId,
              settlementId: allocation.settlementId,
              amountTnd: allocation.amountTnd,
            })),
          },
          201,
        ),
      ),
      true
    );
  }
  return false;
}

export async function mockDistribution(
  page: Page,
  state: DistributionState,
): Promise<void> {
  await page.route("**/api/v1/distributor**", (route) =>
    handleDistribution(route, state),
  );
  await page.route("**/api/v1/pos/products**", (route) =>
    handleDistribution(route, state),
  );
  await page.route("**/api/v1/catalog/products**", (route) =>
    handleDistribution(route, state),
  );
}
