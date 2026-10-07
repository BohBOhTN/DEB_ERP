import Decimal from "decimal.js-light";
import { http } from "msw";
import type {
  Purchase,
  PurchaseInput,
  ShoppingTripInput,
  Supplier,
  SupplierPayment,
  SupplierPaymentInput,
} from "../../../features/procurement/procurement.api.js";
import { kg, piece, sac } from "../../factories/catalog.js";
import { makeExpense } from "../../factories/expenses.js";
import { makePage } from "../../factories/page.js";
import {
  makePurchase,
  makeSupplier,
  makeSupplierPayment,
} from "../../factories/procurement.js";
import { apiError, apiV1, ok } from "../envelope.js";
import type { ExpensesStore } from "./expenses.js";

/// In-memory procurement: balances derive from posted purchases minus
/// payments, like the ledger; posting snapshots conversions from the
/// catalogue store's raw materials.
export interface ProcurementStore {
  suppliers: Supplier[];
  purchases: Purchase[];
  payments: SupplierPayment[];
}

export function makeProcurementStore(
  overrides: Partial<ProcurementStore> = {},
): ProcurementStore {
  const supplier = makeSupplier({ id: "supplier-1", name: "Minoterie du Sud" });
  const purchase = makePurchase({
    id: "purchase-1",
    reference: "AC-000001",
    supplier,
    supplierId: supplier.id,
  });
  return {
    suppliers: [
      supplier,
      makeSupplier({ id: "supplier-2", name: "Sucrerie Nord" }),
    ],
    purchases: [purchase],
    payments: [
      makeSupplierPayment({
        id: "payment-1",
        supplier,
        allocations: [
          {
            id: "alloc-1",
            paymentId: "payment-1",
            purchaseId: "purchase-1",
            amountTnd: "100.000",
          },
        ],
      }),
    ],
    ...overrides,
  };
}

let sequence = 100;
const rawMaterialNames: Record<string, string> = {
  "raw-1": "Farine T55",
  "raw-2": "Sucre",
};
/// Issue 019: the resold products a mock purchase can hold, in pieces.
const productNames: Record<string, string> = {
  "product-water": "Eau 1,5 L",
};

function balanceOf(store: ProcurementStore, purchase: Purchase): Decimal {
  if (purchase.status !== "POSTED") return new Decimal(0);
  const paid = store.payments
    .filter((payment) => !payment.reversedAt)
    .flatMap((payment) => payment.allocations)
    .filter((allocation) => allocation.purchaseId === purchase.id)
    .reduce(
      (sum, allocation) => sum.plus(allocation.amountTnd),
      new Decimal(0),
    );
  return new Decimal(purchase.totalTnd).minus(paid);
}

function withState(store: ProcurementStore, purchase: Purchase): Purchase {
  const balance = balanceOf(store, purchase);
  const overdue = purchase.dueDate
    ? new Date(purchase.dueDate).getTime() < Date.now() &&
      balance.greaterThan(0)
    : false;
  return {
    ...purchase,
    balanceTnd: balance.toFixed(3),
    paymentState:
      purchase.status === "CANCELLED"
        ? "CANCELLED"
        : balance.isZero() && purchase.status === "POSTED"
          ? "PAID"
          : overdue
            ? "OVERDUE"
            : balance.lessThan(purchase.totalTnd) &&
                purchase.status === "POSTED"
              ? "PARTIALLY_PAID"
              : "UNPAID",
  };
}

function supplierBalance(store: ProcurementStore, supplier: Supplier): Decimal {
  return store.purchases
    .filter((purchase) => purchase.supplierId === supplier.id)
    .reduce(
      (sum, purchase) => sum.plus(balanceOf(store, purchase)),
      new Decimal(0),
    );
}

/// The server's field-level refusal of a purchase (issue 016): the same
/// material on two lines, named on the second one.
function purchaseRefusal(input: PurchaseInput) {
  const seen = new Set<string>();
  const fieldErrors: Record<string, string> = {};
  input.lines.forEach((line, index) => {
    const item = line.productId ?? line.rawMaterialId ?? "";
    if (seen.has(item)) {
      fieldErrors[
        `lines.${index}.${line.productId ? "productId" : "rawMaterialId"}`
      ] = line.productId
        ? "Ce produit est déjà sur une autre ligne."
        : "Cette matière première est déjà sur une autre ligne.";
    }
    seen.add(item);
  });

  return Object.keys(fieldErrors).length > 0
    ? apiError(
        400,
        "VALIDATION_ERROR",
        "Les données saisies sont invalides.",
        fieldErrors,
      )
    : null;
}

function buildPurchase(
  store: ProcurementStore,
  input: PurchaseInput,
  existing?: Purchase,
): Purchase {
  const supplier = store.suppliers.find((row) => row.id === input.supplierId);
  if (!supplier) throw new Error("supplier");
  const lines = input.lines.map((line, index) => {
    if (line.productId) {
      const quantity = new Decimal(line.enteredQuantity);
      return {
        id: `line-${sequence}-${index}`,
        rawMaterialId: null,
        productId: line.productId,
        enteredUnitId: line.enteredUnitId,
        baseUnitId: piece.id,
        enteredQuantity: quantity.toFixed(6),
        conversionFactorToBase: "1.000000",
        normalizedQuantity: quantity.toFixed(6),
        unitPriceTnd: new Decimal(line.unitPriceTnd).toFixed(3),
        lineTotalTnd: quantity.times(line.unitPriceTnd).toFixed(3),
        rawMaterialNameSnapshot: productNames[line.productId] ?? "Produit",
        enteredUnitNameSnapshot: piece.name,
        baseUnitNameSnapshot: piece.name,
      };
    }
    const entered = line.enteredUnitId === sac.id ? sac : kg;
    const factor = line.enteredUnitId === sac.id ? "50.000000" : "1.000000";
    const normalized = new Decimal(line.enteredQuantity).times(factor);
    return {
      id: `line-${sequence}-${index}`,
      rawMaterialId: line.rawMaterialId ?? null,
      productId: null,
      enteredUnitId: line.enteredUnitId,
      baseUnitId: kg.id,
      enteredQuantity: new Decimal(line.enteredQuantity).toFixed(6),
      conversionFactorToBase: factor,
      normalizedQuantity: normalized.toFixed(6),
      unitPriceTnd: new Decimal(line.unitPriceTnd).toFixed(3),
      lineTotalTnd: normalized.times(line.unitPriceTnd).toFixed(3),
      rawMaterialNameSnapshot:
        rawMaterialNames[line.rawMaterialId ?? ""] ?? "Matière",
      enteredUnitNameSnapshot: entered.name,
      baseUnitNameSnapshot: kg.name,
    };
  });
  const total = lines.reduce(
    (sum, line) => sum.plus(line.lineTotalTnd),
    new Decimal(0),
  );
  return makePurchase({
    ...(existing ?? {}),
    id: existing?.id ?? `purchase-${sequence}`,
    reference: existing?.reference ?? null,
    supplier,
    supplierId: supplier.id,
    purchaseDate: new Date(input.purchaseDate).toISOString(),
    supplierReference: input.supplierReference ?? null,
    status: "DRAFT",
    paymentTerms: input.paymentTerms,
    dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : null,
    totalTnd: total.toFixed(3),
    paidAmountTnd: new Decimal(
      input.paymentTerms === "PAID"
        ? total
        : input.paymentTerms === "UNPAID"
          ? 0
          : input.paidAmountTnd,
    ).toFixed(3),
    notes: input.notes ?? null,
    postedAt: null,
    lines,
    balanceTnd: "0.000",
    paymentState: "UNPAID",
  });
}

/// Posts a draft the way the post route does: a reference, a posting time
/// and, when something was paid at posting, the payment and its allocation.
function postDraft(store: ProcurementStore, purchase: Purchase) {
  sequence += 1;
  Object.assign(purchase, {
    status: "POSTED",
    reference: `AC-${String(sequence).padStart(6, "0")}`,
    postedAt: new Date().toISOString(),
  });
  if (new Decimal(purchase.paidAmountTnd).greaterThan(0)) {
    store.payments.unshift(
      makeSupplierPayment({
        id: `payment-${sequence}`,
        supplier: purchase.supplier,
        supplierId: purchase.supplierId,
        amountTnd: purchase.paidAmountTnd,
        paidAt: purchase.postedAt ?? new Date().toISOString(),
        allocations: [
          {
            id: `alloc-${sequence}`,
            paymentId: `payment-${sequence}`,
            purchaseId: purchase.id,
            amountTnd: purchase.paidAmountTnd,
          },
        ],
      }),
    );
  }
}

export function procurementHandlers(
  store: ProcurementStore = makeProcurementStore(),
  /// The expenses a shopping trip writes (issue 018); without it the trip
  /// route records the purchase alone.
  expenses?: ExpensesStore,
) {
  return [
    http.get(`${apiV1}/procurement/supplier-balances`, ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      const rows = store.suppliers
        .filter((supplier) => supplier.name.toLowerCase().includes(q))
        .map((supplier) => {
          const open = store.purchases
            .filter(
              (purchase) =>
                purchase.supplierId === supplier.id &&
                purchase.status === "POSTED" &&
                balanceOf(store, purchase).greaterThan(0),
            )
            .map((purchase) => withState(store, purchase));
          return {
            supplier,
            balanceTnd: supplierBalance(store, supplier).toFixed(3),
            openPurchaseCount: open.length,
            overduePurchaseCount: open.filter(
              (purchase) => purchase.paymentState === "OVERDUE",
            ).length,
            openPurchases: open.map((purchase) => ({
              purchaseId: purchase.id,
              reference: purchase.reference,
              dueDate: purchase.dueDate,
              balanceTnd: purchase.balanceTnd,
              paymentState: purchase.paymentState,
            })),
          };
        });
      return ok(makePage(rows));
    }),
    http.get(`${apiV1}/procurement/suppliers/:id/statement`, ({ params }) => {
      const supplier = store.suppliers.find((row) => row.id === params.id);
      if (!supplier)
        return apiError(404, "SUPPLIER_NOT_FOUND", "Fournisseur introuvable.");
      const purchases = store.purchases
        .filter(
          (purchase) =>
            purchase.supplierId === supplier.id && purchase.status === "POSTED",
        )
        .map((purchase) => withState(store, purchase));
      const payments = store.payments.filter(
        (payment) => payment.supplierId === supplier.id,
      );
      const ledgerEntries = [
        ...purchases.map((purchase) => ({
          id: `le-${purchase.id}`,
          entryType: "PURCHASE_PAYABLE" as const,
          amountTnd: purchase.totalTnd,
          occurredAt: purchase.postedAt ?? purchase.purchaseDate,
          purchaseId: purchase.id,
          paymentId: null,
          purchase: { id: purchase.id, reference: purchase.reference },
        })),
        ...payments.map((payment) => ({
          id: `le-${payment.id}`,
          entryType: "PAYMENT" as const,
          amountTnd: `-${payment.amountTnd}`,
          occurredAt: payment.paidAt,
          purchaseId: null,
          paymentId: payment.id,
          payment: { id: payment.id, reference: payment.reference },
        })),
      ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const balance = supplierBalance(store, supplier).toFixed(3);
      return ok({
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
      });
    }),
    http.get(`${apiV1}/procurement/suppliers/:id`, ({ params }) => {
      const supplier = store.suppliers.find((row) => row.id === params.id);
      return supplier
        ? ok({
            supplier: {
              ...supplier,
              balanceTnd: supplierBalance(store, supplier).toFixed(3),
            },
          })
        : apiError(404, "SUPPLIER_NOT_FOUND", "Fournisseur introuvable.");
    }),
    http.post(`${apiV1}/procurement/suppliers`, async ({ request }) => {
      const body = (await request.json()) as Partial<Supplier>;
      if (!body.name)
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          { name: "Ce champ est obligatoire." },
        );
      sequence += 1;
      const supplier = makeSupplier({
        ...body,
        id: `supplier-${sequence}`,
        version: 1,
      });
      store.suppliers.push(supplier);
      return ok({ supplier }, 201);
    }),
    http.patch(
      `${apiV1}/procurement/suppliers/:id`,
      async ({ params, request }) => {
        const body = (await request.json()) as Partial<Supplier> & {
          version: number;
        };
        const supplier = store.suppliers.find((row) => row.id === params.id);
        if (!supplier)
          return apiError(
            404,
            "SUPPLIER_NOT_FOUND",
            "Fournisseur introuvable.",
          );
        if (body.version !== supplier.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        Object.assign(supplier, body, { version: supplier.version + 1 });
        return ok({ supplier });
      },
    ),
    http.get(`${apiV1}/procurement/purchases`, ({ request }) => {
      const url = new URL(request.url);
      const supplierId = url.searchParams.get("supplierId");
      const status = url.searchParams.get("status");
      const dueState = url.searchParams.get("dueState");
      const rows = store.purchases
        .map((purchase) => withState(store, purchase))
        .filter(
          (purchase) =>
            (!supplierId || purchase.supplierId === supplierId) &&
            (!status || purchase.status === status) &&
            (dueState !== "OVERDUE" || purchase.paymentState === "OVERDUE"),
        );
      return ok(makePage(rows));
    }),
    http.post(`${apiV1}/procurement/purchases`, async ({ request }) => {
      const body = (await request.json()) as PurchaseInput;
      const refusal = purchaseRefusal(body);
      if (refusal) return refusal;
      if (!body.lines?.length)
        return apiError(
          400,
          "PURCHASE_LINES_REQUIRED",
          "Ajoutez au moins une ligne à l'achat.",
        );
      sequence += 1;
      const purchase = buildPurchase(store, body);
      store.purchases.unshift(purchase);
      return ok({ purchase }, 201);
    }),
    http.get(`${apiV1}/procurement/purchases/:id`, ({ params }) => {
      const purchase = store.purchases.find((row) => row.id === params.id);
      if (!purchase)
        return apiError(404, "PURCHASE_NOT_FOUND", "Achat introuvable.");
      const linked = (expenses?.expenses ?? []).filter(
        (expense) => expense.purchaseId === purchase.id,
      );
      return ok({
        purchase: {
          ...withState(store, purchase),
          expenses: linked.map((expense) => ({
            id: expense.id,
            reference: expense.reference,
            description: expense.description,
            amountTnd: expense.amountTnd,
            status: expense.status,
            category: { id: expense.category.id, name: expense.category.name },
          })),
          expensesTotalTnd: linked
            .filter((expense) => expense.status === "POSTED")
            .reduce(
              (sum, expense) => sum.plus(expense.amountTnd),
              new Decimal(0),
            )
            .toFixed(3),
        },
      });
    }),
    // Issue 018: one trip, two documents, refused whole on a bad line.
    http.post(`${apiV1}/procurement/shopping-trips`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as ShoppingTripInput;
      if (!body.purchase && body.expenses.length === 0)
        return apiError(
          400,
          "SHOPPING_TRIP_EMPTY",
          "Ajoutez au moins une matière première, un produit de revente ou une dépense.",
        );
      const fieldErrors: Record<string, string> = {};
      body.expenses.forEach((line, index) => {
        const category = expenses?.categories.find(
          (row) => row.id === line.categoryId && row.isActive,
        );
        if (!category)
          fieldErrors[`expenses.${index}.categoryId`] =
            "Une catégorie de dépense active est obligatoire.";
        if (!line.description.trim())
          fieldErrors[`expenses.${index}.description`] =
            "Un libellé est obligatoire.";
        if (!(Number(line.amountTnd) > 0))
          fieldErrors[`expenses.${index}.amountTnd`] =
            "Le montant doit être supérieur à zéro.";
      });
      if (Object.keys(fieldErrors).length > 0)
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          fieldErrors,
        );
      let purchase: Purchase | null = null;
      if (body.purchase) {
        const refusal = purchaseRefusal({
          supplierId: body.supplierId,
          purchaseDate: body.tripDate,
          supplierReference: body.supplierReference,
          notes: body.notes,
          ...body.purchase,
        });
        if (refusal) return refusal;
        sequence += 1;
        purchase = buildPurchase(store, {
          supplierId: body.supplierId,
          purchaseDate: body.tripDate,
          supplierReference: body.supplierReference,
          notes: body.notes,
          ...body.purchase,
        });
        store.purchases.unshift(purchase);
        postDraft(store, purchase);
      }
      const supplier = store.suppliers.find(
        (row) => row.id === body.supplierId,
      );
      const created = body.expenses.map((line) => {
        sequence += 1;
        const category = expenses?.categories.find(
          (row) => row.id === line.categoryId,
        );
        const expense = makeExpense({
          id: `expense-${sequence}`,
          reference: `DEP-${String(sequence).padStart(6, "0")}`,
          categoryId: line.categoryId,
          ...(category ? { category } : {}),
          status: "POSTED",
          expenseDate: new Date(body.tripDate).toISOString(),
          postedAt: new Date().toISOString(),
          amountTnd: line.amountTnd,
          description: line.description,
          externalReference: body.supplierReference ?? null,
          supplierId: body.supplierId,
          purchaseId: purchase?.id ?? null,
          supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
          purchase: purchase
            ? { id: purchase.id, reference: purchase.reference }
            : null,
        });
        expenses?.expenses.unshift(expense);
        return expense;
      });
      const expensesTnd = created.reduce(
        (sum, expense) => sum.plus(expense.amountTnd),
        new Decimal(0),
      );
      const purchaseTnd = new Decimal(purchase?.totalTnd ?? 0);
      return ok(
        {
          purchase: purchase ? withState(store, purchase) : null,
          expenses: created.map((expense) => ({
            id: expense.id,
            reference: expense.reference,
            description: expense.description,
            amountTnd: expense.amountTnd,
          })),
          totals: {
            purchaseTnd: purchaseTnd.toFixed(3),
            expensesTnd: expensesTnd.toFixed(3),
            totalTnd: purchaseTnd.plus(expensesTnd).toFixed(3),
            paidTodayTnd: new Decimal(purchase?.paidAmountTnd ?? 0)
              .plus(expensesTnd)
              .toFixed(3),
          },
        },
        201,
      );
    }),
    http.patch(
      `${apiV1}/procurement/purchases/:id`,
      async ({ params, request }) => {
        const body = (await request.json()) as PurchaseInput;
        const index = store.purchases.findIndex((row) => row.id === params.id);
        if (index < 0)
          return apiError(404, "PURCHASE_NOT_FOUND", "Achat introuvable.");
        if (store.purchases[index]!.status !== "DRAFT")
          return apiError(
            409,
            "PURCHASE_NOT_DRAFT",
            "Seul un achat en brouillon peut être modifié ou validé.",
          );
        sequence += 1;
        store.purchases[index] = buildPurchase(
          store,
          body,
          store.purchases[index],
        );
        return ok({ purchase: store.purchases[index] });
      },
    ),
    http.post(
      `${apiV1}/procurement/purchases/:id/post`,
      ({ params, request }) => {
        if (!request.headers.get("Idempotency-Key"))
          return apiError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Une clé d'idempotence est requise.",
          );
        const purchase = store.purchases.find((row) => row.id === params.id);
        if (!purchase)
          return apiError(404, "PURCHASE_NOT_FOUND", "Achat introuvable.");
        if (purchase.status !== "DRAFT")
          return apiError(
            409,
            "PURCHASE_NOT_DRAFT",
            "Seul un achat en brouillon peut être modifié ou validé.",
          );
        sequence += 1;
        Object.assign(purchase, {
          status: "POSTED",
          reference: `AC-${String(sequence).padStart(6, "0")}`,
          postedAt: new Date().toISOString(),
        });
        if (new Decimal(purchase.paidAmountTnd).greaterThan(0)) {
          store.payments.unshift(
            makeSupplierPayment({
              id: `payment-${sequence}`,
              supplier: purchase.supplier,
              supplierId: purchase.supplierId,
              amountTnd: purchase.paidAmountTnd,
              paidAt: purchase.postedAt ?? new Date().toISOString(),
              allocations: [
                {
                  id: `alloc-${sequence}`,
                  paymentId: `payment-${sequence}`,
                  purchaseId: purchase.id,
                  amountTnd: purchase.paidAmountTnd,
                },
              ],
            }),
          );
        }
        return ok({ purchase: withState(store, purchase) }, 201);
      },
    ),
    http.post(
      `${apiV1}/procurement/purchases/:id/cancel`,
      async ({ params, request }) => {
        if (!request.headers.get("Idempotency-Key"))
          return apiError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Une clé d'idempotence est requise.",
          );
        const body = (await request.json()) as { reason?: string };
        const purchase = store.purchases.find((row) => row.id === params.id);
        if (!purchase)
          return apiError(404, "PURCHASE_NOT_FOUND", "Achat introuvable.");
        if (purchase.status !== "POSTED")
          return apiError(
            409,
            "PURCHASE_NOT_POSTED",
            "Cette opération s'applique à un achat validé.",
          );
        Object.assign(purchase, {
          status: "CANCELLED",
          cancelledAt: new Date().toISOString(),
          cancellationReason: body.reason ?? null,
        });
        // Issue 016: a payment that settled nothing but this purchase is
        // taken back by the cancellation and reads as cancelled.
        for (const payment of store.payments) {
          const settles = [
            payment.purchase?.id,
            ...payment.allocations.map((allocation) => allocation.purchaseId),
          ].filter(Boolean);
          if (
            !payment.reversedAt &&
            settles.length > 0 &&
            settles.every((id) => id === purchase.id)
          ) {
            Object.assign(payment, {
              reversedAt: purchase.cancelledAt,
              reversalReason: `Achat ${purchase.reference ?? ""} annulé : ${body.reason ?? ""}`,
            });
          }
        }
        return ok({ purchase: withState(store, purchase) }, 201);
      },
    ),
    http.get(`${apiV1}/procurement/supplier-payments`, ({ request }) => {
      const supplierId = new URL(request.url).searchParams.get("supplierId");
      return ok(
        makePage(
          store.payments
            .filter(
              (payment) => !supplierId || payment.supplierId === supplierId,
            )
            .map((payment) => ({
              ...payment,
              allocations: payment.allocations.map((allocation) => {
                const purchase = store.purchases.find(
                  (row) => row.id === allocation.purchaseId,
                );
                return {
                  ...allocation,
                  purchase: purchase
                    ? {
                        id: purchase.id,
                        reference: purchase.reference,
                        purchaseDate: purchase.purchaseDate,
                        totalTnd: purchase.totalTnd,
                        status: purchase.status,
                      }
                    : undefined,
                };
              }),
            })),
        ),
      );
    }),
    http.post(`${apiV1}/procurement/supplier-payments`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as SupplierPaymentInput;
      const supplier = store.suppliers.find(
        (row) => row.id === body.supplierId,
      );
      if (!supplier)
        return apiError(404, "SUPPLIER_NOT_FOUND", "Fournisseur introuvable.");
      const owed = supplierBalance(store, supplier);
      if (new Decimal(body.amountTnd).greaterThan(owed))
        return apiError(
          409,
          "SUPPLIER_OVERPAYMENT_REJECTED",
          "Le paiement dépasse le montant dû au fournisseur.",
        );
      // Like the server: explicit allocations first, the remainder on the
      // oldest open purchases, and allocations above the amount refused.
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
          allocation.purchaseId,
          new Decimal(allocation.amountTnd),
        ]),
      );
      let remainder = new Decimal(body.amountTnd).minus(requestedTotal);
      const openPurchases = store.purchases
        .filter(
          (purchase) =>
            purchase.supplierId === supplier.id &&
            balanceOf(store, purchase).greaterThan(0),
        )
        .sort((left, right) =>
          left.purchaseDate.localeCompare(right.purchaseDate),
        );
      for (const purchase of openPurchases) {
        if (!remainder.greaterThan(0)) break;
        const available = balanceOf(store, purchase).minus(
          planned.get(purchase.id) ?? 0,
        );
        if (!available.greaterThan(0)) continue;
        const take = available.lessThan(remainder) ? available : remainder;
        planned.set(
          purchase.id,
          (planned.get(purchase.id) ?? new Decimal(0)).plus(take),
        );
        remainder = remainder.minus(take);
      }
      sequence += 1;
      const payment = makeSupplierPayment({
        id: `payment-${sequence}`,
        supplier,
        supplierId: supplier.id,
        amountTnd: new Decimal(body.amountTnd).toFixed(3),
        paidAt: new Date(body.paidAt).toISOString(),
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        allocations: openPurchases
          .filter((purchase) => planned.has(purchase.id))
          .map((purchase, index) => ({
            id: `alloc-${sequence}-${index}`,
            paymentId: `payment-${sequence}`,
            purchaseId: purchase.id,
            amountTnd: (planned.get(purchase.id) ?? new Decimal(0)).toFixed(3),
          })),
      });
      store.payments.unshift(payment);
      return ok(
        {
          payment,
          allocations: payment.allocations.map((allocation) => ({
            purchaseId: allocation.purchaseId,
            amountTnd: allocation.amountTnd,
          })),
        },
        201,
      );
    }),
    http.post(
      `${apiV1}/procurement/supplier-payments/:paymentId/reverse`,
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
            "SUPPLIER_PAYMENT_NOT_FOUND",
            "Paiement introuvable.",
          );
        if (payment.reversedAt)
          return apiError(
            409,
            "PAYMENT_ALREADY_REVERSED",
            "Ce paiement a déjà été annulé.",
          );
        const settled = payment.allocations.map((allocation) =>
          store.purchases.find((row) => row.id === allocation.purchaseId),
        );
        if (
          settled.length > 0 &&
          settled.every((purchase) => purchase?.status === "CANCELLED")
        )
          return apiError(
            409,
            "PAYMENT_DOCUMENT_CANCELLED",
            "Ce paiement est lié à un achat annulé : il a déjà été repris par l'annulation.",
          );
        Object.assign(payment, {
          reversedAt: new Date().toISOString(),
          reversalReason: body.reason ?? null,
        });
        return ok({ payment }, 201);
      },
    ),
  ];
}
