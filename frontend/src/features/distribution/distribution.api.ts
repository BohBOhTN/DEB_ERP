import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";
import type { SalePaymentState } from "../customers/customers.api.js";

/// `/api/v1/distribution` (UI-16). Custody is a quantity equation per
/// dispatch line; money follows the distributor ledger (DST-010 to DST-028).
export interface Distributor {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  /// List and detail: what is owed and how many dispatch lines are still held.
  balanceTnd?: string;
  heldLineCount?: number;
}

export interface DistributorDetail extends Distributor {
  balanceTnd: string;
  heldLineCount: number;
}

export interface DistributorSaleLine {
  id: string;
  productId: string;
  quantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

export interface DistributorSale {
  id: string;
  reference: string;
  distributorId: string;
  status: "POSTED" | "CANCELLED";
  paymentState: SalePaymentState;
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  notes: string | null;
  distributor?: Distributor;
  lines?: DistributorSaleLine[];
}

export interface DispatchLine {
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

export interface Dispatch {
  id: string;
  reference: string;
  distributorId: string;
  status: "OPEN" | "CLOSED";
  dispatchedAt: string;
  notes: string | null;
  version: number;
  distributor: Distributor;
  lines: DispatchLine[];
  /// Detail only.
  settlements?: Settlement[];
}

export interface SettlementLine {
  id: string;
  dispatchLineId: string;
  productId: string;
  soldQuantity: string;
  returnedQuantity: string;
  unaccountedQuantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

export interface Settlement {
  id: string;
  reference: string;
  distributorId: string;
  dispatchId: string;
  settledAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  paymentState: SalePaymentState;
  notes: string | null;
  distributor?: Distributor;
  dispatch?: Pick<Dispatch, "id" | "reference" | "status" | "dispatchedAt">;
  lines: SettlementLine[];
}

export interface CustodyLine extends DispatchLine {
  dispatchReference: string;
  dispatchedAt: string;
  distributorId: string;
  distributorName: string;
}

export interface Custody {
  items: CustodyLine[];
  discrepancies: CustodyLine[];
}

export interface DistributorBalanceRow {
  distributor: Distributor;
  balanceTnd: string;
  lastPaymentAt: string | null;
}

export interface DistributorPayment {
  id: string;
  distributorId: string;
  amountTnd: string;
  method: "CASH";
  paidAt: string;
  reference: string | null;
  notes: string | null;
  distributor: Distributor;
  allocations: Array<{
    id: string;
    saleId: string | null;
    settlementId: string | null;
    amountTnd: string;
  }>;
}

export interface DistributorStatement {
  distributor: Distributor;
  balanceTnd: string;
  sales: Array<DistributorSale & { balanceTnd: string }>;
  settlements: Array<Settlement & { balanceTnd: string }>;
  ledgerEntries: Array<{
    id: string;
    entryType:
      | "SALE_RECEIVABLE"
      | "SETTLEMENT_RECEIVABLE"
      | "PAYMENT"
      | "SALE_REVERSAL"
      | "PAYMENT_REVERSAL";
    amountTnd: string;
    occurredAt: string;
    saleId: string | null;
    settlementId: string | null;
    paymentId: string | null;
  }>;
  payments: DistributorPayment[];
  meta: {
    openingBalanceTnd: string;
    closingBalanceTnd: string;
    nextCursor: string | null;
    basis: string;
    hasMoreSales: boolean;
    hasMoreSettlements: boolean;
    hasMorePayments: boolean;
  };
}

export interface DistributorListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: SortSpec;
  isActive?: boolean;
}

export function listDistributors(
  query: DistributorListQuery,
): Promise<PageResult<Distributor>> {
  return apiClient.list<Distributor>("/distributors", {
    query: toSearchParams({ ...query }),
  });
}

export async function getDistributor(
  distributorId: string,
): Promise<DistributorDetail> {
  return (
    await apiClient.get<{ distributor: DistributorDetail }>(
      `/distributors/${distributorId}`,
    )
  ).distributor;
}

export interface DistributorInput {
  name: string;
  phone?: string;
  address?: string;
  taxIdentifier?: string;
  notes?: string;
}

export async function createDistributor(
  input: DistributorInput,
): Promise<Distributor> {
  return (
    await apiClient.post<{ distributor: Distributor }>("/distributors", input)
  ).distributor;
}

export async function updateDistributor(
  distributorId: string,
  input: Partial<DistributorInput> & { version: number; isActive?: boolean },
): Promise<Distributor> {
  return (
    await apiClient.patch<{ distributor: Distributor }>(
      `/distributors/${distributorId}`,
      input,
    )
  ).distributor;
}

export interface DirectSaleInput {
  distributorId: string;
  soldAt: string;
  paidAmountTnd?: string;
  notes?: string;
  lines: Array<{ productId: string; quantity: string; unitPriceTnd: string }>;
}

export async function postDirectSale(
  input: DirectSaleInput,
  idempotencyKey: string,
): Promise<DistributorSale> {
  return (
    await apiClient.post<{ sale: DistributorSale }>(
      "/distributor-sales",
      input,
      { idempotencyKey },
    )
  ).sale;
}

export interface DispatchListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  distributorId?: string;
  status?: "OPEN" | "CLOSED";
}

export function listDispatches(
  query: DispatchListQuery,
): Promise<PageResult<Dispatch>> {
  return apiClient.list<Dispatch>("/distributor-dispatches", {
    query: toSearchParams({ ...query }),
  });
}

export async function getDispatch(dispatchId: string): Promise<Dispatch> {
  return (
    await apiClient.get<{ dispatch: Dispatch }>(
      `/distributor-dispatches/${dispatchId}`,
    )
  ).dispatch;
}

export interface DispatchInput {
  distributorId: string;
  dispatchedAt: string;
  notes?: string;
  lines: Array<{ productId: string; quantity: string }>;
}

export async function postDispatch(
  input: DispatchInput,
  idempotencyKey: string,
): Promise<Dispatch> {
  return (
    await apiClient.post<{ dispatch: Dispatch }>(
      "/distributor-dispatches",
      input,
      { idempotencyKey },
    )
  ).dispatch;
}

export interface SettlementListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  distributorId?: string;
  dispatchId?: string;
  from?: string;
  to?: string;
}

export function listSettlements(
  query: SettlementListQuery,
): Promise<PageResult<Settlement>> {
  return apiClient.list<Settlement>("/distributor-settlements", {
    query: toSearchParams({ ...query }),
  });
}

export interface SettlementInput {
  dispatchId: string;
  settledAt: string;
  paidAmountTnd?: string;
  notes?: string;
  lines: Array<{
    dispatchLineId: string;
    soldQuantity?: string;
    returnedQuantity?: string;
    unaccountedQuantity?: string;
    unitPriceTnd: string;
  }>;
}

export async function postSettlement(
  input: SettlementInput,
  idempotencyKey: string,
): Promise<Settlement> {
  return (
    await apiClient.post<{ settlement: Settlement }>(
      "/distributor-settlements",
      input,
      { idempotencyKey },
    )
  ).settlement;
}

export async function getCustody(distributorId?: string): Promise<Custody> {
  return (
    await apiClient.get<{ custody: Custody }>("/distributor-custody", {
      query: distributorId ? { distributorId } : undefined,
    })
  ).custody;
}

export interface BalanceListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: "name" | "balance";
  minBalance?: string;
}

export function listDistributorBalances(
  query: BalanceListQuery,
): Promise<PageResult<DistributorBalanceRow>> {
  const { sort, ...rest } = query;
  return apiClient.list<DistributorBalanceRow>("/distributor-balances", {
    query: { ...toSearchParams(rest), ...(sort ? { sort } : {}) },
  });
}

export interface StatementQuery {
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function getDistributorStatement(
  distributorId: string,
  query: StatementQuery = {},
): Promise<DistributorStatement> {
  return (
    await apiClient.get<{ statement: DistributorStatement }>(
      `/distributors/${distributorId}/statement`,
      { query: toSearchParams({ page: 1, pageSize: 1, ...query } as never) },
    )
  ).statement;
}

export interface PaymentListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  distributorId?: string;
}

export function listDistributorPayments(
  query: PaymentListQuery,
): Promise<PageResult<DistributorPayment>> {
  return apiClient.list<DistributorPayment>("/distributor-payments", {
    query: toSearchParams({ ...query }),
  });
}

export interface DistributorPaymentInput {
  distributorId: string;
  paidAt: string;
  amountTnd: string;
  reference?: string;
  notes?: string;
  allocations: Array<{
    saleId?: string;
    settlementId?: string;
    amountTnd: string;
  }>;
}

export async function createDistributorPayment(
  input: DistributorPaymentInput,
  idempotencyKey: string,
): Promise<DistributorPayment> {
  return (
    await apiClient.post<{ payment: DistributorPayment }>(
      "/distributor-payments",
      input,
      { idempotencyKey },
    )
  ).payment;
}
