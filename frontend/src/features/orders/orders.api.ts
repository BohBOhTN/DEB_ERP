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
  /// Advances actually received (receipts less refunds), kept after
  /// completion or cancellation resets the balance (issue #45).
  advanceReceivedTnd: string;
  /// What remains due: total less the advance while open, the linked sale's
  /// remaining due once completed, nothing once cancelled.
  remainingDueTnd: string;
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

export interface OrderFilterQuery {
  status?: OrderStatus;
  customerId?: string;
  dueBefore?: string;
  dueAfter?: string;
  dueState?: "OVERDUE" | "UPCOMING";
  /// Reference or customer name.
  q?: string;
}

export interface OrderListQuery extends OrderFilterQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
}

export function listOrders(query: OrderListQuery): Promise<PageResult<Order>> {
  return apiClient.list<Order>("/orders", {
    query: toSearchParams({ ...query }),
  });
}

/// The KPI row above the queue: the same filters, no paging.
export interface OrdersSummary {
  count: number;
  openCount: number;
  readyCount: number;
  completedCount: number;
  cancelledCount: number;
  overdueCount: number;
  dueTodayCount: number;
  openTotalTnd: string;
  advanceHeldTnd: string;
  remainingTnd: string;
  completedTotalTnd: string;
}

export async function getOrdersSummary(
  query: OrderFilterQuery,
): Promise<OrdersSummary> {
  return (
    await apiClient.get<{ summary: OrdersSummary }>("/orders/summary", {
      query: toSearchParams({ page: 1, pageSize: 1, ...query } as never),
    })
  ).summary;
}

export async function getOrder(orderId: string): Promise<Order> {
  return (await apiClient.get<{ order: Order }>(`/orders/${orderId}`)).order;
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
    await apiClient.post<{ order: Order }>("/orders", input, {
      idempotencyKey,
    })
  ).order;
}

export async function changeOrderStatus(
  orderId: string,
  input: { version: number; status: "CONFIRMED" | "PREPARING" | "READY" },
): Promise<Order> {
  return (
    await apiClient.post<{ order: Order }>(`/orders/${orderId}/status`, input)
  ).order;
}

export async function recordAdvance(
  orderId: string,
  input: { amountTnd: string; paidAt: string; notes?: string },
  idempotencyKey: string,
): Promise<{ order: Order; advance: OrderAdvance }> {
  return apiClient.post<{ order: Order; advance: OrderAdvance }>(
    `/orders/${orderId}/advances`,
    input,
    { idempotencyKey },
  );
}

export async function completeOrder(
  orderId: string,
  input: { completedAt: string; paidAmountTnd: string },
  idempotencyKey: string,
): Promise<Order> {
  return (
    await apiClient.post<{ order: Order }>(
      `/orders/${orderId}/complete`,
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
    await apiClient.post<{ order: Order }>(`/orders/${orderId}/cancel`, input, {
      idempotencyKey,
    })
  ).order;
}
