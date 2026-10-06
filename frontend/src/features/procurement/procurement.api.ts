import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1/procurement` (UI-12). Shapes follow the service includes: a
/// purchase carries its supplier and lines; balances and payment states come
/// from the supplier ledger, never from an editable total.
export type PurchaseStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type PurchasePaymentTerms = "PAID" | "PARTIAL" | "UNPAID";
export type SupplierPaymentState =
  "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export interface Supplier {
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

export interface SupplierDetail extends Supplier {
  balanceTnd: string;
}

export interface PurchaseLine {
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

export interface Purchase {
  id: string;
  reference: string | null;
  supplierId: string;
  purchaseDate: string;
  supplierReference: string | null;
  status: PurchaseStatus;
  paymentTerms: PurchasePaymentTerms;
  dueDate: string | null;
  totalTnd: string;
  paidAmountTnd: string;
  notes: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  supplier: Supplier;
  lines: PurchaseLine[];
  /// Detail only: the payments recorded against this purchase at posting.
  payments?: Array<{
    id: string;
    amountTnd: string;
    paidAt: string;
    reference: string | null;
  }>;
  /// Remaining due and derived state, from the ledger (list and detail).
  balanceTnd: string;
  paymentState: SupplierPaymentState;
  /// Detail only (issue 018): the other goods bought on the same shopping
  /// trip, and the total of the posted ones.
  expenses?: LinkedExpense[];
  expensesTotalTnd?: string;
}

export interface LinkedExpense {
  id: string;
  reference: string;
  description: string;
  amountTnd: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  category: { id: string; name: string };
}

export interface SupplierPaymentAllocation {
  id: string;
  paymentId: string;
  purchaseId: string;
  amountTnd: string;
  purchase?: {
    id: string;
    reference: string | null;
    purchaseDate: string;
    totalTnd: string;
    status?: PurchaseStatus;
  };
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amountTnd: string;
  method: "CASH";
  paidAt: string;
  reference: string | null;
  notes: string | null;
  supplier: Supplier;
  /// The purchase a payment taken at posting belongs to (issue 016).
  purchase?: {
    id: string;
    reference: string | null;
    status: PurchaseStatus;
  } | null;
  allocations: SupplierPaymentAllocation[];
  /// Set when the payment was reversed, by hand or by the cancellation of
  /// its purchase; its ledger effect is compensated.
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface SupplierBalanceRow {
  supplier: Supplier;
  balanceTnd: string;
  openPurchaseCount: number;
  overduePurchaseCount: number;
  openPurchases: Array<{
    purchaseId: string;
    reference: string | null;
    dueDate: string | null;
    totalTnd: string;
    balanceTnd: string;
    paymentState: SupplierPaymentState;
  }>;
}

export interface SupplierStatement {
  supplier: Supplier;
  balanceTnd: string;
  purchases: Array<
    Purchase & { balanceTnd: string; paymentState: SupplierPaymentState }
  >;
  ledgerEntries: Array<{
    id: string;
    entryType:
      "PURCHASE_PAYABLE" | "PAYMENT" | "PURCHASE_REVERSAL" | "PAYMENT_REVERSAL";
    amountTnd: string;
    occurredAt: string;
    purchaseId: string | null;
    paymentId: string | null;
    purchase?: { id: string; reference: string | null } | null;
    payment?: { id: string; reference: string | null } | null;
  }>;
  payments: SupplierPayment[];
  meta: {
    openingBalanceTnd: string;
    closingBalanceTnd: string;
    nextCursor: string | null;
    basis: string;
  };
}

export interface SupplierListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: "name" | "balance";
  minBalance?: string;
}

export function listSupplierBalances(
  query: SupplierListQuery,
): Promise<PageResult<SupplierBalanceRow>> {
  // The balances endpoint sorts by a plain name, not `field:direction`.
  const { sort, ...rest } = query;
  return apiClient.list<SupplierBalanceRow>("/procurement/supplier-balances", {
    query: { ...toSearchParams(rest), ...(sort ? { sort } : {}) },
  });
}

export async function getSupplier(supplierId: string): Promise<SupplierDetail> {
  return (
    await apiClient.get<{ supplier: SupplierDetail }>(
      `/procurement/suppliers/${supplierId}`,
    )
  ).supplier;
}

export interface SupplierInput {
  name: string;
  phone?: string;
  taxIdentifier?: string;
  address?: string;
  notes?: string;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  return (
    await apiClient.post<{ supplier: Supplier }>(
      "/procurement/suppliers",
      input,
    )
  ).supplier;
}

export async function updateSupplier(
  supplierId: string,
  input: Partial<SupplierInput> & { version: number; isActive?: boolean },
): Promise<Supplier> {
  return (
    await apiClient.patch<{ supplier: Supplier }>(
      `/procurement/suppliers/${supplierId}`,
      input,
    )
  ).supplier;
}

export interface PurchaseListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  supplierId?: string;
  status?: PurchaseStatus;
  paymentTerms?: PurchasePaymentTerms;
  dueState?: "OVERDUE" | "UPCOMING";
  rawMaterialId?: string;
  from?: string;
  to?: string;
}

export function listPurchases(
  query: PurchaseListQuery,
): Promise<PageResult<Purchase>> {
  return apiClient.list<Purchase>("/procurement/purchases", {
    query: toSearchParams({ ...query }),
  });
}

export async function getPurchase(purchaseId: string): Promise<Purchase> {
  return (
    await apiClient.get<{ purchase: Purchase }>(
      `/procurement/purchases/${purchaseId}`,
    )
  ).purchase;
}

export interface PurchaseLineInput {
  rawMaterialId: string;
  enteredUnitId: string;
  enteredQuantity: string;
  unitPriceTnd: string;
}

export interface PurchaseInput {
  supplierId: string;
  purchaseDate: string;
  supplierReference?: string;
  paymentTerms: PurchasePaymentTerms;
  paidAmountTnd: string;
  dueDate?: string;
  notes?: string;
  lines: PurchaseLineInput[];
}

export async function createPurchase(input: PurchaseInput): Promise<Purchase> {
  return (
    await apiClient.post<{ purchase: Purchase }>(
      "/procurement/purchases",
      input,
    )
  ).purchase;
}

export async function updateDraftPurchase(
  purchaseId: string,
  input: PurchaseInput,
): Promise<Purchase> {
  return (
    await apiClient.patch<{ purchase: Purchase }>(
      `/procurement/purchases/${purchaseId}`,
      input,
    )
  ).purchase;
}

export async function postPurchase(
  purchaseId: string,
  idempotencyKey: string,
): Promise<Purchase> {
  return (
    await apiClient.post<{ purchase: Purchase }>(
      `/procurement/purchases/${purchaseId}/post`,
      undefined,
      { idempotencyKey },
    )
  ).purchase;
}

/// Issue 018: one trip to one store, validated once. `purchase` is absent
/// when no raw material was bought; `expenses` may be empty.
export interface ShoppingTripInput {
  supplierId: string;
  tripDate: string;
  supplierReference?: string;
  notes?: string;
  purchase?: {
    paymentTerms: PurchasePaymentTerms;
    paidAmountTnd: string;
    dueDate?: string;
    lines: PurchaseLineInput[];
  };
  expenses: Array<{
    categoryId: string;
    description: string;
    amountTnd: string;
  }>;
}

export interface ShoppingTripResult {
  purchase: Purchase | null;
  expenses: Array<{
    id: string;
    reference: string;
    description: string;
    amountTnd: string;
  }>;
  totals: {
    purchaseTnd: string;
    expensesTnd: string;
    totalTnd: string;
    paidTodayTnd: string;
  };
}

export function postShoppingTrip(
  input: ShoppingTripInput,
  idempotencyKey: string,
): Promise<ShoppingTripResult> {
  return apiClient.post<ShoppingTripResult>(
    "/procurement/shopping-trips",
    input,
    { idempotencyKey },
  );
}

export async function cancelPurchase(
  purchaseId: string,
  reason: string,
  idempotencyKey: string,
): Promise<Purchase> {
  return (
    await apiClient.post<{ purchase: Purchase }>(
      `/procurement/purchases/${purchaseId}/cancel`,
      { reason },
      { idempotencyKey },
    )
  ).purchase;
}

export interface StatementQuery {
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function getSupplierStatement(
  supplierId: string,
  query: StatementQuery = {},
): Promise<SupplierStatement> {
  return (
    await apiClient.get<{ statement: SupplierStatement }>(
      `/procurement/suppliers/${supplierId}/statement`,
      { query: toSearchParams({ page: 1, pageSize: 1, ...query } as never) },
    )
  ).statement;
}

export interface PaymentListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  supplierId?: string;
}

export function listSupplierPayments(
  query: PaymentListQuery,
): Promise<PageResult<SupplierPayment>> {
  return apiClient.list<SupplierPayment>("/procurement/supplier-payments", {
    query: toSearchParams({ ...query }),
  });
}

export interface SupplierPaymentInput {
  supplierId: string;
  paidAt: string;
  amountTnd: string;
  reference?: string;
  notes?: string;
  allocations: Array<{ purchaseId: string; amountTnd: string }>;
}

/// The command answers without the supplier object the list rows carry.
export type SupplierPaymentCreated = Omit<SupplierPayment, "supplier">;

/// The server completes the allocations (the amount left unallocated goes
/// to the oldest open purchases), so the answer's allocations are what the
/// payment settled.
export async function createSupplierPayment(
  input: SupplierPaymentInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCreated> {
  const result = await apiClient.post<{
    payment: Omit<SupplierPaymentCreated, "allocations">;
    allocations: Array<{ purchaseId: string; amountTnd: string }>;
  }>("/procurement/supplier-payments", input, { idempotencyKey });

  return {
    ...result.payment,
    allocations: result.allocations.map((allocation) => ({
      id: `${result.payment.id}:${allocation.purchaseId}`,
      paymentId: result.payment.id,
      purchaseId: allocation.purchaseId,
      amountTnd: allocation.amountTnd,
    })),
  };
}

export async function reverseSupplierPayment(
  paymentId: string,
  reason: string,
  idempotencyKey: string,
): Promise<SupplierPaymentCreated> {
  return (
    await apiClient.post<{ payment: SupplierPaymentCreated }>(
      `/procurement/supplier-payments/${paymentId}/reverse`,
      { reason },
      { idempotencyKey },
    )
  ).payment;
}
