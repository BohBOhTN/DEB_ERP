import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page } from "../catalog/catalogApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export type DispatchStatus = "OPEN" | "CLOSED";
export type DistributorPaymentState = "PAID" | "PARTIALLY_PAID" | "UNPAID";

export interface Distributor {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
}

export interface DistributorSaleLine {
  id: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  quantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
}

export interface DistributorSale {
  id: string;
  reference: string;
  distributorId: string;
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  paymentState: DistributorPaymentState;
  lines?: DistributorSaleLine[];
}

export interface DispatchLine {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  dispatchedQuantity: string;
  settledSoldQuantity: string;
  returnedQuantity: string;
  unaccountedQuantity: string;
  stillHeldQuantity: string;
}

export interface Dispatch {
  id: string;
  reference: string;
  distributorId: string;
  status: DispatchStatus;
  dispatchedAt: string;
  notes: string | null;
  distributor?: Distributor;
  lines: DispatchLine[];
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

export interface DistributorSettlement {
  id: string;
  reference: string;
  totalTnd: string;
  paidAmountTnd: string;
  remainingDueTnd: string;
  paymentState: DistributorPaymentState;
  settledAt: string;
}

export interface DistributorBalance {
  distributor: Distributor;
  balanceTnd: string;
}

export interface DistributorPayment {
  id: string;
  distributorId: string;
  amountTnd: string;
  paidAt: string;
  reference: string | null;
  distributor?: Distributor;
}

export interface DistributorStatement {
  distributor: Distributor;
  balanceTnd: string;
  sales: Array<DistributorSale & { balanceTnd: string }>;
  settlements: Array<DistributorSettlement & { balanceTnd: string }>;
  payments: DistributorPayment[];
}

export async function getDistributors(params?: {
  search?: string;
}): Promise<Page<Distributor>> {
  const query = params?.search
    ? `?search=${encodeURIComponent(params.search)}`
    : "";
  return getKeyed(`/distributors${query}`, "distributors");
}

export async function createDistributor(params: {
  name: string;
  phone?: string;
  address?: string;
  taxIdentifier?: string;
  notes?: string;
}): Promise<Distributor> {
  return postKeyed("/distributors", params, "distributor", false);
}

export async function updateDistributor(
  distributorId: string,
  params: { version: number; isActive?: boolean; name?: string },
): Promise<Distributor> {
  const response = await fetch(`${apiBaseUrl}/distributors/${distributorId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    distributor: Distributor;
  }>;
  return body.data.distributor;
}

export async function postDirectSale(params: {
  distributorId: string;
  soldAt: string;
  paidAmountTnd?: string;
  lines: Array<{
    productId: string;
    quantity: string;
    unitPriceTnd: string;
  }>;
}): Promise<DistributorSale> {
  return postKeyed("/distributor-sales", params, "sale");
}

export async function getDispatches(params?: {
  status?: DispatchStatus;
}): Promise<Page<Dispatch>> {
  const query = params?.status ? `?status=${params.status}` : "";
  return getKeyed(`/distributor-dispatches${query}`, "dispatches");
}

export async function postDispatch(params: {
  distributorId: string;
  dispatchedAt: string;
  lines: Array<{ productId: string; quantity: string }>;
}): Promise<Dispatch> {
  return postKeyed("/distributor-dispatches", params, "dispatch");
}

export async function getCustody(params?: {
  distributorId?: string;
}): Promise<Custody> {
  const query = params?.distributorId
    ? `?distributorId=${encodeURIComponent(params.distributorId)}`
    : "";
  return getKeyed(`/distributor-custody${query}`, "custody");
}

export async function postSettlement(params: {
  dispatchId: string;
  settledAt: string;
  paidAmountTnd?: string;
  lines: Array<{
    dispatchLineId: string;
    soldQuantity?: string;
    returnedQuantity?: string;
    unaccountedQuantity?: string;
    unitPriceTnd: string;
  }>;
}): Promise<DistributorSettlement> {
  return postKeyed("/distributor-settlements", params, "settlement");
}

export async function getDistributorBalances(): Promise<
  Page<DistributorBalance>
> {
  return getKeyed("/distributor-balances", "distributorBalances");
}

export async function getDistributorStatement(
  distributorId: string,
): Promise<DistributorStatement> {
  return getKeyed(`/distributors/${distributorId}/statement`, "statement");
}

export async function getDistributorPayments(): Promise<
  Page<DistributorPayment>
> {
  return getKeyed("/distributor-payments", "distributorPayments");
}

export async function createDistributorPayment(params: {
  distributorId: string;
  paidAt: string;
  amountTnd: string;
  reference?: string;
  allocations?: Array<{
    saleId?: string;
    settlementId?: string;
    amountTnd: string;
  }>;
}): Promise<DistributorPayment> {
  return postKeyed("/distributor-payments", params, "payment");
}

async function getKeyed<TResult>(path: string, key: string): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}

async function postKeyed<TResult>(
  path: string,
  payload: unknown,
  key: string,
  withIdempotencyKey = true,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(withIdempotencyKey ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}
