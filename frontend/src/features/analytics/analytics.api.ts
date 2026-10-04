import { apiClient } from "../../lib/api/client.js";
import type { MarginDay } from "../home/home.api.js";

/// `/api/v1/analytics` (issue 014, DEC-V2-006): read-only analyses over
/// posted documents, days and hours in Tunis. A block is `null` when the
/// caller lacks the permission it belongs to.
export interface AnalyticsQuery {
  /// Business days, `YYYY-MM-DD`; the server defaults to the last 30 days.
  from?: string;
  to?: string;
}

export interface AnalyticsPeriod {
  from: string;
  to: string;
  days: number;
  granularity: "day" | "month";
  previousFrom: string;
  previousTo: string;
}

export interface TrendBucket {
  /// `YYYY-MM-DD`, or `YYYY-MM` when the granularity is the month.
  bucket: string;
  revenueTnd: string;
  salesCount: number;
  /// `null` without `expenses.view`.
  expensesTnd: string | null;
  /// Same rank in the previous window; `null` on a monthly trend.
  previousRevenueTnd: string | null;
}

export interface AnalyticsOverview {
  period: AnalyticsPeriod;
  generatedAt: string;
  revenue: {
    totalTnd: string;
    previousTotalTnd: string;
    counterTnd: string;
    ordersTnd: string;
    distributorsTnd: string;
  };
  /// Till sales only: a distributor document is revenue, not a basket.
  sales: {
    count: number;
    previousCount: number;
    averageBasketTnd: string | null;
    previousAverageBasketTnd: string | null;
    remainingDueTnd: string;
    cancelledCount: number;
  };
  expenses: {
    totalTnd: string;
    previousTotalTnd: string;
    byCategory: Array<{ categoryId: string; name: string; totalTnd: string }>;
  } | null;
  margin: { current: MarginDay; previous: MarginDay } | null;
  trend: TrendBucket[];
  bestBucket: { bucket: string; revenueTnd: string } | null;
}

export interface FrequencyCell {
  /// ISO weekday: Monday is 1, Sunday is 7.
  weekday: number;
  hour: number;
  count: number;
  totalTnd: string;
}

export interface FrequencyBlock {
  count: number;
  totalTnd: string;
  /// Non-empty cells only.
  cells: FrequencyCell[];
  weekdays: Array<{
    weekday: number;
    /// Occurrences of this weekday in the window.
    days: number;
    count: number;
    totalTnd: string;
    averageCount: number;
    averageTnd: string;
  }>;
  hours: Array<{ hour: number; count: number; totalTnd: string }>;
  peak: FrequencyCell | null;
}

export interface AnalyticsFrequency {
  period: AnalyticsPeriod;
  sales: FrequencyBlock;
  /// Order pickups by requested time; `null` without `orders.view`.
  orders: FrequencyBlock | null;
}

export interface ProductAnalysis {
  productId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unitName: string;
  quantity: string;
  /// Documents that hold the product: how often it sells.
  documentsCount: number;
  revenueTnd: string;
  lastSoldAt: string;
  /// `null` without `margin.view`; the margin is `null` too for a product
  /// never costed.
  costedRevenueTnd: string | null;
  marginTnd: string | null;
}

export interface AnalyticsProducts {
  period: AnalyticsPeriod;
  totals: { revenueTnd: string; productsCount: number };
  /// Ranked by revenue; one row per product sold, so bounded by the
  /// catalogue.
  items: ProductAnalysis[];
  categories: Array<{ categoryId: string; name: string; revenueTnd: string }>;
  unsold: {
    count: number;
    items: Array<{ productId: string; name: string }>;
  };
}

export interface AnalyticsCustomers {
  period: AnalyticsPeriod;
  summary: {
    identifiedSalesCount: number;
    identifiedRevenueTnd: string;
    anonymousSalesCount: number;
    anonymousRevenueTnd: string;
    activeCount: number;
    returningCount: number;
    newCount: number;
  };
  top: Array<{
    customerId: string;
    name: string;
    salesCount: number;
    revenueTnd: string;
    averageBasketTnd: string;
    lastPurchaseAt: string;
  }>;
  inactive: {
    thresholdDays: number;
    count: number;
    items: Array<{
      customerId: string;
      name: string;
      lastPurchaseAt: string;
      daysSince: number;
      salesCount: number;
      revenueTnd: string;
    }>;
  };
}

/// Only the bounds that carry a value; without them the server reads the
/// last thirty days.
function periodParams(query: AnalyticsQuery): Record<string, string> {
  return {
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
  };
}

export async function getOverview(
  query: AnalyticsQuery,
): Promise<AnalyticsOverview> {
  return (
    await apiClient.get<{ overview: AnalyticsOverview }>(
      "/analytics/overview",
      { query: periodParams(query) },
    )
  ).overview;
}

export async function getFrequency(
  query: AnalyticsQuery,
): Promise<AnalyticsFrequency> {
  return (
    await apiClient.get<{ frequency: AnalyticsFrequency }>(
      "/analytics/frequency",
      { query: periodParams(query) },
    )
  ).frequency;
}

export async function getProducts(
  query: AnalyticsQuery,
): Promise<AnalyticsProducts> {
  return (
    await apiClient.get<{ products: AnalyticsProducts }>(
      "/analytics/products",
      { query: periodParams(query) },
    )
  ).products;
}

export async function getCustomers(
  query: AnalyticsQuery,
): Promise<AnalyticsCustomers> {
  return (
    await apiClient.get<{ customers: AnalyticsCustomers }>(
      "/analytics/customers",
      { query: periodParams(query) },
    )
  ).customers;
}
