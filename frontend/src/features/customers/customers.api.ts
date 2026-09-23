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

export async function createCustomerPayment(
  input: CustomerPaymentInput,
  idempotencyKey: string,
): Promise<CustomerPayment> {
  return (
    await apiClient.post<{ payment: CustomerPayment }>(
      "/customer-payments",
      input,
      { idempotencyKey },
    )
  ).payment;
}
