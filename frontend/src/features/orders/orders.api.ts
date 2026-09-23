import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";
import type { Customer, SaleSummary } from "../customers/customers.api.js";

/// `/api/v1/orders` (UI-14). Money before fulfilment is an advance; the
/// linked sale exists only once the order is completed (ORD-006 to ORD-011).
export type OrderStatus =
  "DRAFT" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type AdvanceDisposition = "REFUNDED" | "CREDITED";

export interface OrderLine {
  id: string;
  productId: string;
  unitId: string;
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

export interface Order {
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
  createdAt: string;
  customer: Customer;
  /// List rows carry the line count; the detail carries the lines.
  _count?: { lines: number };
  lines?: OrderLine[];
  advances?: OrderAdvance[];
  sale?:
    | (SaleSummary & {
        lines: Array<{
          id: string;
          productNameSnapshot: string;
          quantity: string;
          lineTotalTnd: string;
        }>;
      })
    | null;
}

export interface OrderListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  status?: OrderStatus;
  customerId?: string;
  dueBefore?: string;
  dueAfter?: string;
  dueState?: "OVERDUE" | "UPCOMING";
}

export function listOrders(query: OrderListQuery): Promise<PageResult<Order>> {
  return apiClient.list<Order>("/orders/orders", {
    query: toSearchParams({ ...query }),
  });
}

export async function getOrder(orderId: string): Promise<Order> {
  return (await apiClient.get<{ order: Order }>(`/orders/orders/${orderId}`))
    .order;
}

export interface OrderInput {
  customerId: string;
  requestedFulfillmentAt: string;
  notes?: string;
  lines: Array<{ productId: string; quantity: string }>;
}

export async function createOrder(
  input: OrderInput,
  idempotencyKey: string,
): Promise<Order> {
  return (
    await apiClient.post<{ order: Order }>("/orders/orders", input, {
      idempotencyKey,
    })
  ).order;
}

export async function changeOrderStatus(
  orderId: string,
  input: { version: number; status: "CONFIRMED" | "PREPARING" | "READY" },
): Promise<Order> {
  return (
    await apiClient.post<{ order: Order }>(
      `/orders/orders/${orderId}/status`,
      input,
    )
  ).order;
}

export async function recordAdvance(
  orderId: string,
  input: { amountTnd: string; paidAt: string; notes?: string },
  idempotencyKey: string,
): Promise<{ order: Order; advance: OrderAdvance }> {
  return apiClient.post<{ order: Order; advance: OrderAdvance }>(
    `/orders/orders/${orderId}/advances`,
    input,
    { idempotencyKey },
  );
}

export async function completeOrder(
  orderId: string,
  input: { completedAt: string; paidAmountTnd?: string },
  idempotencyKey: string,
): Promise<Order> {
  return (
    await apiClient.post<{ order: Order }>(
      `/orders/orders/${orderId}/complete`,
      input,
      { idempotencyKey },
    )
  ).order;
}

export async function cancelOrder(
  orderId: string,
  input: {
    cancelledAt: string;
    reason: string;
    advanceDisposition?: AdvanceDisposition;
  },
  idempotencyKey: string,
): Promise<Order> {
  return (
    await apiClient.post<{ order: Order }>(
      `/orders/orders/${orderId}/cancel`,
      input,
      { idempotencyKey },
    )
  ).order;
}
