import { apiClient } from "../../lib/api/client.js";

/// `GET /api/v1/home/summary` (BE-31). Blocks are `null` when the caller
/// lacks the matching permission.
export interface SalesDay {
  count: number;
  totalTnd: string;
  cashTnd: string;
  creditTnd: string;
}

export interface MarginDay {
  revenueTnd: string;
  costedRevenueTnd: string;
  costTnd: string;
  marginTnd: string;
  uncostedLinesCount: number;
}

export interface HomeSummary {
  date: string;
  generatedAt: string;
  sales: { today: SalesDay; previousDay: SalesDay } | null;
  openSession: {
    id: string;
    openedAt: string;
    terminal: string;
    cashier: { id: string; displayName: string } | null;
    openingCashTnd: string;
  } | null;
  receivables: {
    customersTnd: string | null;
    distributorsTnd: string | null;
  } | null;
  payables: {
    suppliersTnd: string;
    overdueCount: number;
    overdueTnd: string;
  } | null;
  orders: {
    dueTodayCount: number;
    overdueCount: number;
    readyCount: number;
  } | null;
  stock: {
    negativeCount: number;
    items: Array<{
      itemType: "PRODUCT" | "RAW_MATERIAL";
      itemId: string;
      name: string;
      quantity: string;
    }>;
  } | null;
  expenses: { dayTnd: string; dayCount: number; previousDayTnd: string } | null;
  /// Issue 008: revenue and cost of the day's posted sale lines that carry
  /// a cost snapshot; `null` without `margin.view`.
  margin: { today: MarginDay; previousDay: MarginDay } | null;
  custody: { heldLinesCount: number } | null;
  recent: Array<{
    id: string;
    at: string;
    action: string;
    actionLabelFr: string;
    entity: string;
    entityLabelFr: string;
    targetId: string | null;
    module: string | null;
    actor: { id: string; displayName: string } | null;
  }> | null;
}

export async function fetchHomeSummary(date?: string): Promise<HomeSummary> {
  const data = await apiClient.get<{ summary: HomeSummary }>("/home/summary", {
    query: date ? { date } : undefined,
  });

  return data.summary;
}
