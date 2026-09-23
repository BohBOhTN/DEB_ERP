import type { Page, Route } from "@playwright/test";

/// Browser-side procurement mock for the Sprint 21 flows: balances derive
/// from posted purchases minus payment allocations, like the ledger.
interface Supplier {
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

interface Line {
  id: string;
  rawMaterialId: string;
  enteredUnitId: string;
  baseUnitId: string;
  enteredQuantity: string;
  conversionFactorToBase: string;
  normalizedQuantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  rawMaterialNameSnapshot: string;
  enteredUnitNameSnapshot: string;
  baseUnitNameSnapshot: string;
}

interface Purchase {
  id: string;
  reference: string | null;
  supplierId: string;
  purchaseDate: string;
  supplierReference: string | null;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  paymentTerms: "PAID" | "PARTIAL" | "UNPAID";
  dueDate: string | null;
  totalTnd: string;
  paidAmountTnd: string;
  notes: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  lines: Line[];
}

interface Payment {
  id: string;
  supplierId: string;
  amountTnd: string;
  method: "CASH";
  paidAt: string;
  reference: string | null;
  notes: string | null;
  allocations: Array<{
    id: string;
    paymentId: string;
    purchaseId: string;
    amountTnd: string;
  }>;
}

export interface ProcurementState {
  suppliers: Supplier[];
  purchases: Purchase[];
  payments: Payment[];
}

const kg = {
  id: "unit-kg",
  code: "KG",
  name: "Kilogramme",
  symbol: "kg",
  precision: 3,
  isActive: true,
};
const sac = {
  id: "unit-sac",
  code: "SAC",
  name: "Sac de 50 kg",
  symbol: "sac",
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
  conversions: [
    {
      id: "conv-1",
      rawMaterialId: "raw-1",
      unitId: sac.id,
      factorToBase: "50.000000",
      isActive: true,
      unit: sac,
    },
  ],
};

export function makeProcurementState(): ProcurementState {
  return {
    suppliers: [
      {
        id: "supplier-1",
        name: "Minoterie du Sud",
        phone: "71 000 000",
        address: null,
        taxIdentifier: null,
        notes: null,
        isActive: true,
        version: 1,
        createdAt: "2026-09-01T08:00:00.000Z",
      },
    ],
    purchases: [],
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

let sequence = 0;
const money = (value: number) => value.toFixed(3);

function balanceOf(state: ProcurementState, purchase: Purchase): number {
  if (purchase.status !== "POSTED") return 0;
  const paid = state.payments
    .flatMap((payment) => payment.allocations)
    .filter((allocation) => allocation.purchaseId === purchase.id)
    .reduce((sum, allocation) => sum + Number(allocation.amountTnd), 0);
  return Number(purchase.totalTnd) - paid;
}

function withState(state: ProcurementState, purchase: Purchase) {
  const supplier = state.suppliers.find(
    (row) => row.id === purchase.supplierId,
  );
  const balance = balanceOf(state, purchase);
  const overdue = purchase.dueDate
    ? new Date(purchase.dueDate).getTime() < Date.now() && balance > 0
    : false;
  return {
    ...purchase,
    supplier,
    balanceTnd: money(balance),
    paymentState:
      purchase.status === "CANCELLED"
        ? "CANCELLED"
        : purchase.status === "POSTED" && balance === 0
          ? "PAID"
          : overdue
            ? "OVERDUE"
            : purchase.status === "POSTED" &&
                balance < Number(purchase.totalTnd)
              ? "PARTIALLY_PAID"
              : "UNPAID",
  };
}

function supplierBalance(state: ProcurementState, supplierId: string): number {
  return state.purchases
    .filter((purchase) => purchase.supplierId === supplierId)
    .reduce((sum, purchase) => sum + balanceOf(state, purchase), 0);
}

function balanceRow(state: ProcurementState, supplier: Supplier) {
  const open = state.purchases
    .filter(
      (purchase) =>
        purchase.supplierId === supplier.id &&
        purchase.status === "POSTED" &&
        balanceOf(state, purchase) > 0,
    )
    .map((purchase) => withState(state, purchase));
  return {
    supplier,
    balanceTnd: money(supplierBalance(state, supplier.id)),
    openPurchaseCount: open.length,
    overduePurchaseCount: open.filter(
      (purchase) => purchase.paymentState === "OVERDUE",
    ).length,
    openPurchases: open.map((purchase) => ({
      purchaseId: purchase.id,
      reference: purchase.reference,
      dueDate: purchase.dueDate,
      totalTnd: purchase.totalTnd,
      balanceTnd: purchase.balanceTnd,
      paymentState: purchase.paymentState,
    })),
  };
}

function buildPurchase(
  input: Record<string, unknown>,
  existing?: Purchase,
): Purchase {
  sequence += 1;
  const lines = (input.lines as Array<Record<string, string>>).map(
    (line, index) => {
      const factor = line.enteredUnitId === sac.id ? 50 : 1;
      const normalized = Number(line.enteredQuantity) * factor;
      return {
        id: `line-${sequence}-${index}`,
        rawMaterialId: line.rawMaterialId ?? "",
        enteredUnitId: line.enteredUnitId ?? "",
        baseUnitId: kg.id,
        enteredQuantity: Number(line.enteredQuantity).toFixed(6),
        conversionFactorToBase: factor.toFixed(6),
        normalizedQuantity: normalized.toFixed(6),
        unitPriceTnd: money(Number(line.unitPriceTnd)),
        lineTotalTnd: money(normalized * Number(line.unitPriceTnd)),
        rawMaterialNameSnapshot: flour.name,
        enteredUnitNameSnapshot:
          line.enteredUnitId === sac.id ? sac.name : kg.name,
        baseUnitNameSnapshot: kg.name,
      };
    },
  );
  const total = lines.reduce((sum, line) => sum + Number(line.lineTotalTnd), 0);
  const terms = input.paymentTerms as Purchase["paymentTerms"];
  return {
    id: existing?.id ?? `purchase-${sequence}`,
    reference: existing?.reference ?? null,
    supplierId: input.supplierId as string,
    purchaseDate: new Date(input.purchaseDate as string).toISOString(),
    supplierReference: (input.supplierReference as string) ?? null,
    status: "DRAFT",
    paymentTerms: terms,
    dueDate: input.dueDate
      ? new Date(input.dueDate as string).toISOString()
      : null,
    totalTnd: money(total),
    paidAmountTnd: money(
      terms === "PAID"
        ? total
        : terms === "UNPAID"
          ? 0
          : Number(input.paidAmountTnd),
    ),
    notes: (input.notes as string) ?? null,
    postedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lines,
  };
}

/// Handles the procurement and raw material routes; false for anything else.
export async function handleProcurement(
  route: Route,
  state: ProcurementState,
): Promise<boolean> {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const method = route.request().method();
  const body = () => route.request().postDataJSON() as Record<string, unknown>;

  if (path === "/catalog/raw-materials")
    return (route.fulfill(page([flour])), true);
  if (path === "/catalog/raw-materials/raw-1")
    return (route.fulfill(envelope({ rawMaterial: flour })), true);

  if (path === "/procurement/supplier-balances") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          state.suppliers
            .filter((supplier) => supplier.name.toLowerCase().includes(q))
            .map((supplier) => balanceRow(state, supplier)),
        ),
      ),
      true
    );
  }

  if (path === "/procurement/suppliers" && method === "POST") {
    sequence += 1;
    const input = body();
    const supplier: Supplier = {
      id: `supplier-${sequence}`,
      name: input.name as string,
      phone: (input.phone as string) ?? null,
      address: (input.address as string) ?? null,
      taxIdentifier: (input.taxIdentifier as string) ?? null,
      notes: (input.notes as string) ?? null,
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    state.suppliers.push(supplier);
    return (route.fulfill(envelope({ supplier }, 201)), true);
  }

  const supplierMatch =
    /^\/procurement\/suppliers\/([^/]+)(\/statement)?$/.exec(path);
  if (supplierMatch) {
    const supplier = state.suppliers.find((row) => row.id === supplierMatch[1]);
    if (!supplier)
      return (
        route.fulfill(
          failure(404, "SUPPLIER_NOT_FOUND", "Fournisseur introuvable."),
        ),
        true
      );
    if (supplierMatch[2]) {
      const purchases = state.purchases
        .filter(
          (purchase) =>
            purchase.supplierId === supplier.id && purchase.status === "POSTED",
        )
        .map((purchase) => withState(state, purchase));
      const payments = state.payments.filter(
        (payment) => payment.supplierId === supplier.id,
      );
      const ledgerEntries = [
        ...purchases.map((purchase) => ({
          id: `le-${purchase.id}`,
          entryType: "PURCHASE_PAYABLE",
          amountTnd: purchase.totalTnd,
          occurredAt: purchase.postedAt ?? purchase.purchaseDate,
          purchaseId: purchase.id,
          paymentId: null,
          purchase: { id: purchase.id, reference: purchase.reference },
        })),
        ...payments.map((payment) => ({
          id: `le-${payment.id}`,
          entryType: "PAYMENT",
          amountTnd: `-${payment.amountTnd}`,
          occurredAt: payment.paidAt,
          purchaseId: null,
          paymentId: payment.id,
          payment: { id: payment.id, reference: payment.reference },
        })),
      ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const balance = money(supplierBalance(state, supplier.id));
      return (
        route.fulfill(
          envelope({
            statement: {
              supplier,
              balanceTnd: balance,
              purchases,
              ledgerEntries,
              payments,
              meta: {
                openingBalanceTnd: "0.000",
                closingBalanceTnd: balance,
                nextCursor: null,
                basis: "Solde = achats validés − paiements",
              },
            },
          }),
        ),
        true
      );
    }
    if (method === "PATCH") {
      Object.assign(supplier, body(), { version: supplier.version + 1 });
      return (route.fulfill(envelope({ supplier })), true);
    }
    return (
      route.fulfill(
        envelope({
          supplier: {
            ...supplier,
            balanceTnd: money(supplierBalance(state, supplier.id)),
          },
        }),
      ),
      true
    );
  }

  if (path === "/procurement/purchases" && method === "GET") {
    const supplierId = url.searchParams.get("supplierId");
    const status = url.searchParams.get("status");
    return (
      route.fulfill(
        page(
          state.purchases
            .filter(
              (purchase) =>
                (!supplierId || purchase.supplierId === supplierId) &&
                (!status || purchase.status === status),
            )
            .map((purchase) => withState(state, purchase)),
        ),
      ),
      true
    );
  }

  if (path === "/procurement/purchases" && method === "POST") {
    const purchase = buildPurchase(body());
    state.purchases.unshift(purchase);
    return (
      route.fulfill(envelope({ purchase: withState(state, purchase) }, 201)),
      true
    );
  }

  const purchaseMatch =
    /^\/procurement\/purchases\/([^/]+)(\/post|\/cancel)?$/.exec(path);
  if (purchaseMatch) {
    const index = state.purchases.findIndex(
      (row) => row.id === purchaseMatch[1],
    );
    const purchase = state.purchases[index];
    if (!purchase)
      return (
        route.fulfill(failure(404, "PURCHASE_NOT_FOUND", "Achat introuvable.")),
        true
      );
    if (purchaseMatch[2] === "/post") {
      if (!route.request().headers()["idempotency-key"])
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
      Object.assign(purchase, {
        status: "POSTED",
        reference: `AC-${String(sequence).padStart(6, "0")}`,
        postedAt: new Date().toISOString(),
      });
      if (Number(purchase.paidAmountTnd) > 0) {
        state.payments.unshift({
          id: `payment-${sequence}`,
          supplierId: purchase.supplierId,
          amountTnd: purchase.paidAmountTnd,
          method: "CASH",
          paidAt: purchase.postedAt as string,
          reference: null,
          notes: null,
          allocations: [
            {
              id: `alloc-${sequence}`,
              paymentId: `payment-${sequence}`,
              purchaseId: purchase.id,
              amountTnd: purchase.paidAmountTnd,
            },
          ],
        });
      }
      return (
        route.fulfill(envelope({ purchase: withState(state, purchase) }, 201)),
        true
      );
    }
    if (purchaseMatch[2] === "/cancel") {
      Object.assign(purchase, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancellationReason: (body().reason as string) ?? null,
      });
      return (
        route.fulfill(envelope({ purchase: withState(state, purchase) }, 201)),
        true
      );
    }
    if (method === "PATCH") {
      state.purchases[index] = buildPurchase(body(), purchase);
      return (
        route.fulfill(
          envelope({
            purchase: withState(state, state.purchases[index] as Purchase),
          }),
        ),
        true
      );
    }
    return (
      route.fulfill(envelope({ purchase: withState(state, purchase) })),
      true
    );
  }

  if (path === "/procurement/supplier-payments" && method === "GET") {
    const supplierId = url.searchParams.get("supplierId");
    return (
      route.fulfill(
        page(
          state.payments
            .filter(
              (payment) => !supplierId || payment.supplierId === supplierId,
            )
            .map((payment) => ({
              ...payment,
              supplier: state.suppliers.find(
                (row) => row.id === payment.supplierId,
              ),
            })),
        ),
      ),
      true
    );
  }

  if (path === "/procurement/supplier-payments" && method === "POST") {
    if (!route.request().headers()["idempotency-key"])
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
    const supplier = state.suppliers.find((row) => row.id === input.supplierId);
    if (!supplier)
      return (
        route.fulfill(
          failure(404, "SUPPLIER_NOT_FOUND", "Fournisseur introuvable."),
        ),
        true
      );
    if (Number(input.amountTnd) > supplierBalance(state, supplier.id))
      return (
        route.fulfill(
          failure(
            409,
            "SUPPLIER_OVERPAYMENT_REJECTED",
            "Le paiement dépasse le montant dû au fournisseur.",
          ),
        ),
        true
      );
    sequence += 1;
    const payment: Payment = {
      id: `payment-${sequence}`,
      supplierId: supplier.id,
      amountTnd: money(Number(input.amountTnd)),
      method: "CASH",
      paidAt: new Date(input.paidAt as string).toISOString(),
      reference: (input.reference as string) ?? null,
      notes: (input.notes as string) ?? null,
      allocations: (
        (input.allocations as Array<{
          purchaseId: string;
          amountTnd: string;
        }>) ?? []
      ).map((allocation, index) => ({
        id: `alloc-${sequence}-${index}`,
        paymentId: `payment-${sequence}`,
        purchaseId: allocation.purchaseId,
        amountTnd: money(Number(allocation.amountTnd)),
      })),
    };
    state.payments.unshift(payment);
    return (
      route.fulfill(envelope({ payment: { ...payment, supplier } }, 201)),
      true
    );
  }

  return false;
}

export async function mockProcurement(
  page: Page,
  state: ProcurementState,
): Promise<void> {
  await page.route("**/api/v1/procurement/**", (route) =>
    handleProcurement(route, state),
  );
  await page.route("**/api/v1/catalog/raw-materials**", (route) =>
    handleProcurement(route, state),
  );
}
