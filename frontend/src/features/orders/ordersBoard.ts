import type { PeriodPreset } from "../../lib/dates/periodRange.js";
import { openOrderStatuses } from "./components/orderLabels.js";
import type { Order, OrderFilterQuery } from "./orders.api.js";

export type Board =
  "todo" | "overdue" | "ready" | "completed" | "cancelled" | "all";
export const boards: Array<{ value: Board; label: string }> = [
  { value: "todo", label: "À traiter" },
  { value: "overdue", label: "En retard" },
  { value: "ready", label: "Prêtes" },
  { value: "completed", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
  { value: "all", label: "Toutes" },
];
/// A pickup lies ahead for an open order and behind for a closed one, so
/// the two kinds of tab offer different windows (issue 015). `all` comes
/// first: the queue opens on every date.
export const defaultPeriod: PeriodPreset = "all";
const aheadPresets: PeriodPreset[] = [
  "all",
  "today",
  "tomorrow",
  "next7",
  "custom",
];
const behindPresets: PeriodPreset[] = [
  "all",
  "today",
  "week",
  "month",
  "custom",
];
export const closedBoards: readonly Board[] = ["completed", "cancelled"];

export function presetsFor(board: Board): PeriodPreset[] {
  return closedBoards.includes(board) ? behindPresets : aheadPresets;
}

/// The bounds of a period as instants: whole days in Tunis (UTC+1).
export function windowOf(range: { from: string; to: string }) {
  return {
    ...(range.from
      ? { dueAfter: new Date(`${range.from}T00:00:00+01:00`).toISOString() }
      : {}),
    ...(range.to
      ? { dueBefore: new Date(`${range.to}T23:59:59.999+01:00`).toISOString() }
      : {}),
  };
}

/// The board tab is the status dimension: every open order still to
/// fulfil (late ones included: an order past its hour is still to treat,
/// issue 015), the late ones alone, the ready ones, the closed ones, or
/// all of them. The period (issue #41) is the date dimension on the
/// fulfilment time and combines with the tab; "En retard" ignores it since
/// overdue is dated by definition.
export function boardQuery(
  board: Board,
  range: { from: string; to: string },
): Partial<OrderFilterQuery> {
  const window = windowOf(range);
  switch (board) {
    case "todo":
      return { open: true, ...window };
    case "overdue":
      return { dueState: "OVERDUE" };
    case "ready":
      return { status: "READY", ...window };
    case "completed":
      return { status: "COMPLETED", ...window };
    case "cancelled":
      return { status: "CANCELLED", ...window };
    default:
      return window;
  }
}

/// An open order whose pickup time has passed.
export function isLate(
  order: Pick<Order, "status" | "requestedFulfillmentAt">,
  now = new Date(),
): boolean {
  return (
    openOrderStatuses.includes(order.status) &&
    new Date(order.requestedFulfillmentAt).getTime() < now.getTime()
  );
}

/// Relative label for the fulfilment time: "dans 2 h", "il y a 30 min".
export function dueLabel(value: string, now = new Date()): string {
  const minutes = Math.round(
    (new Date(value).getTime() - now.getTime()) / 60_000,
  );
  const abs = Math.abs(minutes);
  const unit =
    abs < 60
      ? `${abs} min`
      : abs < 48 * 60
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / (24 * 60))} j`;
  return minutes >= 0 ? `dans ${unit}` : `il y a ${unit}`;
}
