import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page } from "../catalog/catalogApi";
import type { Sale } from "../pos/posApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
}

export interface CustomerBalance {
  customer: Customer;
  balanceTnd: string;
  openSaleCount: number;
  openSales: Array<{
    saleId: string;
    soldAt: string;
    balanceTnd: string;
    paymentState: string;
  }>;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  amountTnd: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  customer?: Customer;
  allocations: CustomerPaymentAllocation[];
}

export interface CustomerPaymentAllocation {
  id?: string;
  paymentId?: string;
  saleId: string;
  amountTnd: string;
  sale?: Sale;
}

export interface CustomerStatement {
  customer: Customer;
  balanceTnd: string;
  sales: Array<Sale & { balanceTnd: string }>;
  ledgerEntries: Array<{
    id: string;
    entryType: string;
    amountTnd: string;
    occurredAt: string;
    saleId: string | null;
    paymentId: string | null;
  }>;
  payments: CustomerPayment[];
}

export async function getCustomers(search?: string): Promise<Page<Customer>> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return getPage(`/customers${query}`, "customers");
}

export async function createCustomer(params: {
  name: string;
  phone: string;
  address: string;
  taxIdentifier: string;
  notes: string;
}): Promise<Customer> {
  return mutate("/customers", "POST", params, "customer");
}

export async function updateCustomer(
  customer: Customer,
  params: { isActive: boolean },
): Promise<Customer> {
  return mutate(
    `/customers/${customer.id}`,
    "PATCH",
    {
      version: customer.version,
      isActive: params.isActive,
    },
    "customer",
  );
}

export async function getCustomerBalances(): Promise<Page<CustomerBalance>> {
  return getPage("/customer-balances", "customerBalances");
}

export async function getCustomerStatement(
  customerId: string,
): Promise<CustomerStatement> {
  const response = await fetch(
    `${apiBaseUrl}/customers/${customerId}/statement`,
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    statement: CustomerStatement;
  }>;
  return body.data.statement;
}

export async function getCustomerPayments(): Promise<Page<CustomerPayment>> {
  return getPage("/customer-payments", "customerPayments");
}

export async function createCustomerPayment(params: {
  customerId: string;
  paidAt: string;
  amountTnd: string;
  reference: string;
  notes: string;
  allocations: Array<{
    saleId: string;
    amountTnd: string;
  }>;
}): Promise<void> {
  await postCommand("/customer-payments", {
    ...params,
    paidAt: toIsoDate(params.paidAt),
  });
}

async function getPage<TItem>(path: string, key: string): Promise<Page<TItem>> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<
    Record<string, Page<TItem>>
  >;
  return body.data[key];
}

async function mutate<TResult>(
  path: string,
  method: "POST" | "PATCH",
  payload: unknown,
  key: string,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}

async function postCommand(path: string, payload: unknown): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }
}

function toIsoDate(value: string): string {
  return new Date(`${value}T08:00:00.000`).toISOString();
}
