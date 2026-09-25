import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";
import type { Category, Unit } from "../catalog/catalog.api.js";
import type { Customer, SalePaymentState } from "../customers/customers.api.js";

/// `/api/v1/pos` (UI-15): the single terminal's session, the product and
/// customer lookups, sales and the session history. Money moves only
/// through an open session (POS-003 to POS-006).
export interface ActorSummary {
  id: string;
  displayName: string;
}

export interface PosSession {
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
  openedBy?: ActorSummary | null;
  closedBy?: ActorSummary | null;
  /// List rows: posted sales of the session, summed by the database.
  salesCount?: number;
  salesTotalTnd?: string;
}

export interface SessionTotals {
  salesCount: number;
  salesTotalTnd: string;
  creditGrantedTnd: string;
  cashCollectedTnd: string;
  advancesReceivedTnd: string;
  advancesRefundedTnd: string;
  customerPaymentsTnd: string;
  /// Till règlements reversed during this session: cash handed back from
  /// this drawer.
  customerPaymentReversalsTnd: string;
}

export interface SessionDetail {
  session: PosSession;
  totals: SessionTotals;
}

export interface PosProduct {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  salePriceTnd: string;
  isStockable: boolean;
  isActive: boolean;
  baseUnit: Unit;
  category: Category;
}

export interface SaleLine {
  id: string;
  productId: string;
  quantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

export interface Sale {
  id: string;
  reference: string;
  sessionId: string;
  customerId: string | null;
  status: "POSTED" | "CANCELLED";
  paymentState: SalePaymentState;
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  postedAt: string;
  postedByUserId: string;
  customer: Customer | null;
  postedBy?: ActorSummary | null;
  /// Detail only.
  lines?: SaleLine[];
  payments?: Array<{
    id: string;
    amountTnd: string;
    method: "CASH";
    paidAt: string;
  }>;
  session?: PosSession;
}

export async function getCurrentSession(): Promise<PosSession | null> {
  // A mock or an older server may answer without the key; React Query
  // refuses `undefined` as data, so the absence of a session is `null`.
  return (
    (
      await apiClient.get<{ session?: PosSession | null }>(
        "/pos/sessions/current",
      )
    ).session ?? null
  );
}

export function listPosProducts(query: {
  page: number;
  pageSize: number;
  q?: string;
}): Promise<PageResult<PosProduct>> {
  return apiClient.list<PosProduct>("/pos/products", {
    query: toSearchParams({ ...query }),
  });
}

export function listPosCustomers(query: {
  page: number;
  pageSize: number;
  q?: string;
}): Promise<PageResult<Customer>> {
  return apiClient.list<Customer>("/pos/customers", {
    query: toSearchParams({ ...query }),
  });
}

export async function openSession(
  input: { openingCashTnd: string; notes?: string },
  idempotencyKey: string,
): Promise<PosSession> {
  return (
    await apiClient.post<{ session: PosSession }>("/pos/sessions/open", input, {
      idempotencyKey,
    })
  ).session;
}

export async function closeSession(
  sessionId: string,
  input: { countedCashTnd: string; notes?: string },
  idempotencyKey: string,
): Promise<PosSession> {
  return (
    await apiClient.post<{ session: PosSession }>(
      `/pos/sessions/${sessionId}/close`,
      input,
      { idempotencyKey },
    )
  ).session;
}

export interface SaleInput {
  customerId?: string;
  paidAmountTnd?: string;
  lines: Array<{ productId: string; quantity: string }>;
}

export async function postSale(
  input: SaleInput,
  idempotencyKey: string,
): Promise<Sale> {
  return (
    await apiClient.post<{ sale: Sale }>("/pos/sales", input, {
      idempotencyKey,
    })
  ).sale;
}

export interface SaleListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  from?: string;
  to?: string;
  customerId?: string;
  paymentState?: SalePaymentState;
  sessionId?: string;
}

export function listSales(query: SaleListQuery): Promise<PageResult<Sale>> {
  return apiClient.list<Sale>("/pos/sales", {
    query: toSearchParams({ ...query }),
  });
}

export async function getSale(saleId: string): Promise<Sale> {
  return (await apiClient.get<{ sale: Sale }>(`/pos/sales/${saleId}`)).sale;
}

export interface SessionListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  from?: string;
  to?: string;
  status?: "OPEN" | "CLOSED";
}

export function listSessions(
  query: SessionListQuery,
): Promise<PageResult<PosSession>> {
  return apiClient.list<PosSession>("/pos/sessions", {
    query: toSearchParams({ ...query }),
  });
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return apiClient.get<SessionDetail>(`/pos/sessions/${sessionId}`);
}
