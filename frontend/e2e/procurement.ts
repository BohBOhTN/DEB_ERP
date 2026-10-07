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
  rawMaterialId: string | null;
  productId: string | null;
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

/// An expense recorded on a shopping trip (issue 018), as the purchase
/// page and the expense list read it.
interface TripExpense {
  id: string;
  reference: string;
  categoryId: string;
  status: "POSTED";
  expenseDate: string;
  amountTnd: string;
  description: string;
  externalReference: string | null;
  method: "CASH";
  notes: string | null;
  responsibleUserId: string;
  postedAt: string;
  cancelledAt: null;
  cancellationReason: null;
  version: number;
  createdAt: string;
  category: { id: string; name: string };
  supplierId: string;
  purchaseId: string | null;
  supplier: { id: string; name: string };
  purchase: { id: string; reference: string | null } | null;
}

export interface ProcurementState {
  suppliers: Supplier[];
  purchases: Purchase[];
  payments: Payment[];
  expenses: TripExpense[];
}

/// The expense categories a trip can file its other goods under: a parent
/// and its sub-category, as the server lists them (issue 018).
const expenseCategories = [
  {
    id: "xcat-3",
    name: "Fournitures",
    description: null,
    parentId: null,
    depth: 0,
    path: "Fournitures",
    isActive: true,
    version: 1,
    expenseCount: 0,
  },
  {
    id: "xcat-4",
    name: "Emballage",
    description: null,
    parentId: "xcat-3",
    depth: 1,
    path: "Fournitures › Emballage",
    isActive: true,
    version: 1,
    expenseCount: 0,
  },
];

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

/// Issue 019: a product bought to be resold, counted in pieces.
const pieceUnit = {
  id: "unit-piece",
  code: "PC",
  name: "Pièce",
  symbol: "pièce",
  precision: 0,
  isActive: true,
};
const water = {
  id: "product-water",
  code: null,
  barcode: null,
  name: "Eau 1,5 L",
  categoryId: "category-drinks",
  baseUnitId: pieceUnit.id,
  salePriceTnd: "1.200",
  approximateCostTnd: null,
  imageUrl: null,
  isStockable: true,
  isResale: true,
  isActive: true,
  notes: null,
  version: 1,
  createdAt: "2026-09-01T08:00:00.000Z",
  category: {
    id: "category-drinks",
    name: "Boissons",
    description: null,
    isActive: true,
  },
  baseUnit: pieceUnit,
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
    expenses: [],
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
      if (line.productId) {
        const quantity = Number(line.enteredQuantity);
        return {
          id: `line-${sequence}-${index}`,
          rawMaterialId: null,
          productId: line.productId,
          enteredUnitId: line.enteredUnitId ?? "",
          baseUnitId: pieceUnit.id,
          enteredQuantity: quantity.toFixed(6),
          conversionFactorToBase: (1).toFixed(6),
          normalizedQuantity: quantity.toFixed(6),
          unitPriceTnd: money(Number(line.unitPriceTnd)),
          lineTotalTnd: money(quantity * Number(line.unitPriceTnd)),
          rawMaterialNameSnapshot: water.name,
          enteredUnitNameSnapshot: pieceUnit.name,
          baseUnitNameSnapshot: pieceUnit.name,
        };
      }
      const factor = line.enteredUnitId === sac.id ? 50 : 1;
      const normalized = Number(line.enteredQuantity) * factor;
      return {
        id: `line-${sequence}-${index}`,
        rawMaterialId: line.rawMaterialId ?? "",
        productId: null,
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
  if (path === "/expense-categories")
    return (route.fulfill(envelope({ expenseCategories })), true);
  // Issue 019: the picker asks for the products flagged for resale.
  if (path === "/catalog/products") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          url.searchParams.get("isResale") === "true" &&
            water.name.toLowerCase().includes(q)
            ? [water]
            : [],
        ),
      ),
      true
    );
  }
  if (path === `/catalog/products/${water.id}`)
    return (route.fulfill(envelope({ product: water })), true);

  // Issue 018: the trip posts the purchase and records its expenses at once.
  if (path === "/procurement/shopping-trips" && method === "POST") {
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
    const input = body() as {
      supplierId: string;
      tripDate: string;
      supplierReference?: string;
      notes?: string;
      purchase?: Record<string, unknown>;
      expenses: Array<{
        categoryId: string;
        description: string;
        amountTnd: string;
      }>;
    };
    let purchase: Purchase | null = null;
    if (input.purchase) {
      purchase = buildPurchase({
        supplierId: input.supplierId,
        purchaseDate: input.tripDate,
        supplierReference: input.supplierReference,
        notes: input.notes,
        ...input.purchase,
      });
      state.purchases.unshift(purchase);
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
    }
    const supplier = state.suppliers.find(
      (row) => row.id === input.supplierId,
    ) as Supplier;
    const posted = purchase;
    const expenses = input.expenses.map((line) => {
      sequence += 1;
      const category = expenseCategories.find(
        (row) => row.id === line.categoryId,
      ) ?? { id: line.categoryId, name: "Catégorie" };
      const expense: TripExpense = {
        id: `expense-${sequence}`,
        reference: `DEP-${String(sequence).padStart(6, "0")}`,
        categoryId: line.categoryId,
        status: "POSTED",
        expenseDate: new Date(input.tripDate).toISOString(),
        amountTnd: money(Number(line.amountTnd)),
        description: line.description,
        externalReference: input.supplierReference ?? null,
        method: "CASH",
        notes: null,
        responsibleUserId: "user-1",
        postedAt: new Date().toISOString(),
        cancelledAt: null,
        cancellationReason: null,
        version: 1,
        createdAt: new Date().toISOString(),
        category: { id: category.id, name: category.name },
        supplierId: supplier.id,
        purchaseId: posted?.id ?? null,
        supplier: { id: supplier.id, name: supplier.name },
        purchase: posted
          ? { id: posted.id, reference: posted.reference }
          : null,
      };
      state.expenses.unshift(expense);
      return expense;
    });
    const expensesTnd = expenses.reduce(
      (sum, expense) => sum + Number(expense.amountTnd),
      0,
    );
    const purchaseTnd = Number(purchase?.totalTnd ?? 0);
    return (
      route.fulfill(
        envelope(
          {
            purchase: purchase ? withState(state, purchase) : null,
            expenses,
            totals: {
              purchaseTnd: money(purchaseTnd),
              expensesTnd: money(expensesTnd),
              totalTnd: money(purchaseTnd + expensesTnd),
              paidTodayTnd: money(
                Number(purchase?.paidAmountTnd ?? 0) + expensesTnd,
              ),
            },
          },
          201,
        ),
      ),
      true
    );
  }
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
    const linked = state.expenses.filter(
      (expense) => expense.purchaseId === purchase.id,
    );
    return (
      route.fulfill(
        envelope({
          purchase: {
            ...withState(state, purchase),
            expenses: linked,
            expensesTotalTnd: money(
              linked.reduce(
                (sum, expense) => sum + Number(expense.amountTnd),
                0,
              ),
            ),
          },
        }),
      ),
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
      route.fulfill(
        envelope(
          {
            payment: { ...payment, supplier },
            allocations: payment.allocations.map((allocation) => ({
              purchaseId: allocation.purchaseId,
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
  await page.route("**/api/v1/expense-categories**", (route) =>
    handleProcurement(route, state),
  );
  await page.route("**/api/v1/catalog/products**", (route) =>
    handleProcurement(route, state),
  );
}
