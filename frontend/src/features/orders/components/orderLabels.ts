import type { PermissionSet } from "../../../lib/auth/permissions.js";
import type { Order, OrderStatus } from "../orders.api.js";

export const orderStatusLabels: Record<OrderStatus, string> = {
  DRAFT: "Brouillon",
  CONFIRMED: "Confirmée",
  PREPARING: "En préparation",
  READY: "Prête",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

export const openOrderStatuses: readonly OrderStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "PREPARING",
  "READY",
];

/// The next plain status transition, per the lifecycle of the source of
/// truth (section 12.3); completion and cancellation are separate commands.
export const nextStatus: Partial<
  Record<
    OrderStatus,
    { status: "CONFIRMED" | "PREPARING" | "READY"; label: string }
  >
> = {
  DRAFT: { status: "CONFIRMED", label: "Confirmer" },
  CONFIRMED: { status: "PREPARING", label: "En préparation" },
  PREPARING: { status: "READY", label: "Prête" },
};

export interface OrderActions {
  advance?: { status: "CONFIRMED" | "PREPARING" | "READY"; label: string };
  /// A ready order can go back to preparation (source of truth 12.3).
  resume?: { status: "PREPARING"; label: string };
  recordAdvance: boolean;
  complete: boolean;
  cancel: boolean;
}

/// One action bar computed from the status and the caller's permissions
/// (07 section 4.5): only the permitted transitions appear. Collecting a
/// deposit needs both `orders.update` and `customer_payments.create`, as
/// the route does (issue #45).
export function orderActions(
  order: Pick<Order, "status" | "advanceBalanceTnd" | "totalTnd">,
  permissions: PermissionSet,
): OrderActions {
  const open = openOrderStatuses.includes(order.status);
  return {
    advance:
      open && permissions.has("orders.change_status")
        ? nextStatus[order.status]
        : undefined,
    resume:
      order.status === "READY" && permissions.has("orders.change_status")
        ? { status: "PREPARING", label: "Reprendre la préparation" }
        : undefined,
    recordAdvance:
      open &&
      permissions.has("orders.update") &&
      permissions.has("customer_payments.create") &&
      Number(order.advanceBalanceTnd) < Number(order.totalTnd),
    complete: open && permissions.has("orders.complete"),
    cancel: open && permissions.has("orders.cancel"),
  };
}

/// What the customer still has to pay, as the API states it.
export function remainingOf(order: Pick<Order, "remainingDueTnd">): string {
  return order.remainingDueTnd;
}
