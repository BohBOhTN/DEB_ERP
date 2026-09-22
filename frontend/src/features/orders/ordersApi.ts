import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page } from "../catalog/catalogApi";
import type { Customer } from "../customers/customersApi";
import type { Sale } from "../pos/posApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export type OrderStatus =
  "DRAFT" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

export type AdvanceDisposition = "REFUNDED" | "CREDITED";

export interface OrderLine {
  id: string;
  productId: string;
  quantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

export interface OrderAdvance {
  id: string;
  movement: "RECEIPT" | "REFUND";
  amountTnd: string;
  paidAt: string;
  notes: string | null;
}

export interface CustomerOrder {
  id: string;
  reference: string;
  customerId: string;
  status: OrderStatus;
  requestedFulfillmentAt: string;
  totalTnd: string;
  advanceBalanceTnd: string;
  notes: string | null;
  version: number;
  saleId: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  advanceDisposition: AdvanceDisposition | null;
  customer?: Customer;
  lines?: OrderLine[];
  advances?: OrderAdvance[];
  sale?: Sale | null;
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  DRAFT: "Brouillon",
  CONFIRMED: "Confirmee",
  PREPARING: "En preparation",
  READY: "Prete",
  COMPLETED: "Terminee",
  CANCELLED: "Annulee",
};

export async function getOrders(params: {
  status?: OrderStatus;
  customerId?: string;
}): Promise<Page<CustomerOrder>> {
  const query = new URLSearchParams();

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.customerId) {
    query.set("customerId", params.customerId);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${apiBaseUrl}/orders${suffix}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    orders: Page<CustomerOrder>;
  }>;
  return body.data.orders;
}

export async function getOrder(orderId: string): Promise<CustomerOrder> {
  const response = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    order: CustomerOrder;
  }>;
  return body.data.order;
}

export async function createOrder(params: {
  customerId: string;
  requestedFulfillmentAt: string;
  notes?: string;
  lines: Array<{ productId: string; quantity: string }>;
}): Promise<CustomerOrder> {
  return postCommand("/orders", params);
}

export async function changeOrderStatus(
  orderId: string,
  params: { version: number; status: OrderStatus },
): Promise<CustomerOrder> {
  return postCommand(`/orders/${orderId}/status`, params, false);
}

export async function recordOrderAdvance(
  orderId: string,
  params: { amountTnd: string; paidAt: string; notes?: string },
): Promise<CustomerOrder> {
  return postCommand(`/orders/${orderId}/advances`, params);
}

export async function completeOrder(
  orderId: string,
  params: { completedAt: string; paidAmountTnd?: string },
): Promise<CustomerOrder> {
  return postCommand(`/orders/${orderId}/complete`, params);
}

export async function cancelOrder(
  orderId: string,
  params: {
    cancelledAt: string;
    reason: string;
    advanceDisposition?: AdvanceDisposition;
  },
): Promise<CustomerOrder> {
  return postCommand(`/orders/${orderId}/cancel`, params);
}

async function postCommand(
  path: string,
  payload: unknown,
  withIdempotencyKey = true,
): Promise<CustomerOrder> {
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

  const body = (await response.json()) as ApiEnvelope<{
    order: CustomerOrder;
  }>;
  return body.data.order;
}
