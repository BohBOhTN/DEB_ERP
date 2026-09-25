import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1/customers` (UI-13). Receivable and advance balances come from
/// the customer ledger, never from an editable field.
export type SalePaymentState = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export interface Customer {
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

export interface CustomerDetail extends Customer {
  balanceTnd: string;
  advanceBalanceTnd: string;
}

export interface CustomerBalanceRow {
  customer: Customer;
  balanceTnd: string;
  advanceBalanceTnd: string;
  openSaleCount: number;
  openOrderCount: number;
  openSales: Array<{
    saleId: string;
    soldAt: string;
    balanceTnd: string;
    paymentState: SalePaymentState;
  }>;
}

export interface SaleSummary {
  id: string;
  reference: string;
  customerId: string | null;
  status: "POSTED" | "CANCELLED";
  paymentState: SalePaymentState;
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
}

export interface CustomerPaymentAllocation {
  id: string;
  paymentId: string;
  saleId: string;
  amountTnd: string;
  sale?: SaleSummary;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  sessionId: string | null;
  amountTnd: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  customer: Customer;
  allocations: CustomerPaymentAllocation[];
  /// Set when the règlement was reversed; its ledger effect is compensated.
  reversedAt: string | null;
  reversalReason: string | null;
}

export type CustomerLedgerEntryType =
  | "SALE_RECEIVABLE"
  | "CUSTOMER_PAYMENT"
  | "ORDER_ADVANCE"
  | "ORDER_ADVANCE_APPLIED"
  | "ORDER_ADVANCE_REFUNDED"
  | "ORDER_ADVANCE_CREDITED"
  | "CUSTOMER_CREDIT"
  | string;

export interface CustomerStatement {
  customer: Customer;
  balanceTnd: string;
  advanceBalanceTnd: string;
  sales: Array<SaleSummary & { balanceTnd: string }>;
  orders: Array<{
    id: string;
    reference: string;
    status: string;
    requestedFulfillmentAt: string;
    totalTnd: string;
    advanceBalanceTnd: string;
  }>;
  ledgerEntries: Array<{
    id: string;
    balanceKind: "RECEIVABLE" | "ADVANCE";
    entryType: CustomerLedgerEntryType;
    amountTnd: string;
    occurredAt: string;
    saleId: string | null;
    orderId: string | null;
    paymentId: string | null;
  }>;
  payments: CustomerPayment[];
  meta: {
    openingBalanceTnd: string;
    closingBalanceTnd: string;
    nextCursor: string | null;
    basis: string;
    hasMoreSales: boolean;
    hasMorePayments: boolean;
  };
}

export interface CustomerListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: "name" | "balance";
  minBalance?: string;
  /// Active customers by default; inactive ones on request.
  isActive?: boolean;
}

/// The figures of the customer page (issue #46).
export interface CustomerSummary {
  ordersCount: number;
  openOrdersCount: number;
  salesCount: number;
  cancelledSalesCount: number;
  salesTotalTnd: string;
  paidTnd: string;
  dueTnd: string;
  advanceTnd: string;
  lastSaleAt: string | null;
  lastPaymentAt: string | null;
}

export async function getCustomerSummary(
  customerId: string,
): Promise<CustomerSummary> {
  return (
    await apiClient.get<{ summary: CustomerSummary }>(
      `/customers/${customerId}/summary`,
    )
  ).summary;
}

/// Every sale of the customer, newest first, with what the ledger still
/// carries for each.
export function listCustomerSales(
  customerId: string,
  query: { page: number; pageSize: number },
): Promise<PageResult<SaleSummary & { balanceTnd: string }>> {
  return apiClient.list<SaleSummary & { balanceTnd: string }>(
    `/customers/${customerId}/sales`,
    { query: toSearchParams({ ...query }) },
  );
}

/// CUS-004: deactivation keeps the history and blocks new credit; a
/// customer with a balance cannot be deactivated.
export async function setCustomerActive(
  customerId: string,
  isActive: boolean,
  reason?: string,
): Promise<Customer> {
  return (
    await apiClient.post<{ customer: Customer }>(
      `/customers/${customerId}/${isActive ? "reactivate" : "deactivate"}`,
      { reason },
    )
  ).customer;
}

/// The plain directory (`customers.view`): names for pickers when the
/// caller may not see balances.
export function listCustomers(
  query: Pick<CustomerListQuery, "page" | "pageSize" | "q">,
): Promise<PageResult<Customer>> {
  return apiClient.list<Customer>("/customers", {
    query: toSearchParams({ ...query, isActive: true }),
  });
}

export function listCustomerBalances(
  query: CustomerListQuery,
): Promise<PageResult<CustomerBalanceRow>> {
  // The balances endpoint sorts by a plain name, not `field:direction`.
  const { sort, ...rest } = query;
  return apiClient.list<CustomerBalanceRow>("/customer-balances", {
    query: { ...toSearchParams(rest), ...(sort ? { sort } : {}) },
  });
}

export async function getCustomer(customerId: string): Promise<CustomerDetail> {
  return (
    await apiClient.get<{ customer: CustomerDetail }>(
      `/customers/${customerId}`,
    )
  ).customer;
}

export interface CustomerInput {
  name: string;
  phone?: string;
  address?: string;
  taxIdentifier?: string;
  notes?: string;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  return (await apiClient.post<{ customer: Customer }>("/customers", input))
    .customer;
}

export async function updateCustomer(
  customerId: string,
  input: Partial<CustomerInput> & { version: number; isActive?: boolean },
): Promise<Customer> {
  return (
    await apiClient.patch<{ customer: Customer }>(
      `/customers/${customerId}`,
      input,
    )
  ).customer;
}

export interface StatementQuery {
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function getCustomerStatement(
  customerId: string,
  query: StatementQuery = {},
): Promise<CustomerStatement> {
  return (
    await apiClient.get<{ statement: CustomerStatement }>(
      `/customers/${customerId}/statement`,
      { query: toSearchParams({ page: 1, pageSize: 1, ...query } as never) },
    )
  ).statement;
}

export interface PaymentListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  customerId?: string;
}

export function listCustomerPayments(
  query: PaymentListQuery,
): Promise<PageResult<CustomerPayment>> {
  return apiClient.list<CustomerPayment>("/customer-payments", {
    query: toSearchParams({ ...query }),
  });
}

export interface CustomerPaymentInput {
  customerId: string;
  paidAt: string;
  amountTnd: string;
  reference?: string;
  notes?: string;
  collectedAtPos?: boolean;
  allocations: Array<{ saleId: string; amountTnd: string }>;
}

/// The command answers with the payment and its allocations, without the
/// customer object the list rows carry.
export type CustomerPaymentCreated = Omit<CustomerPayment, "customer">;

/// The server completes the allocations (the amount left unallocated goes
/// to the oldest open sales), so the answer's allocations, not the
/// request's, are what the payment settled.
export async function createCustomerPayment(
  input: CustomerPaymentInput,
  idempotencyKey: string,
): Promise<CustomerPaymentCreated> {
  const result = await apiClient.post<{
    payment: Omit<CustomerPaymentCreated, "allocations">;
    allocations: Array<{ saleId: string; amountTnd: string }>;
  }>("/customer-payments", input, { idempotencyKey });

  return {
    ...result.payment,
    allocations: result.allocations.map((allocation) => ({
      id: `${result.payment.id}:${allocation.saleId}`,
      paymentId: result.payment.id,
      saleId: allocation.saleId,
      amountTnd: allocation.amountTnd,
    })),
  };
}

export async function reverseCustomerPayment(
  paymentId: string,
  reason: string,
  idempotencyKey: string,
): Promise<CustomerPaymentCreated> {
  return (
    await apiClient.post<{ payment: CustomerPaymentCreated }>(
      `/customer-payments/${paymentId}/reverse`,
      { reason },
      { idempotencyKey },
    )
  ).payment;
}
