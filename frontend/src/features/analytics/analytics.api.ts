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
  /// Issue 022: what was bought, by kind; `null` without `purchases.view`.
  purchases: {
    rawMaterialsTnd: string;
    previousRawMaterialsTnd: string;
    resaleTnd: string;
    previousResaleTnd: string;
  } | null;
  /// Issue 022, DEC-V2-012: posted expenses plus the raw materials bought;
  /// `null` without `expenses.view` or `purchases.view`.
  charges: {
    totalTnd: string;
    previousTotalTnd: string;
    expensesTnd: string;
    rawMaterialsTnd: string;
  } | null;
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

/// Issue 021: what was bought over the window, split by what a purchase
/// line buys. Posted purchases only, on their purchase date, for their full
/// amount whether paid or not.
export interface AnalyticsPurchases {
  period: AnalyticsPeriod;
  generatedAt: string;
  totals: {
    totalTnd: string;
    previousTotalTnd: string;
    rawMaterialsTnd: string;
    previousRawMaterialsTnd: string;
    resaleTnd: string;
    previousResaleTnd: string;
    purchasesCount: number;
    previousPurchasesCount: number;
    /// Still owed today on the purchases of the window.
    remainingDueTnd: string;
  };
  trend: Array<{ bucket: string; rawMaterialsTnd: string; resaleTnd: string }>;
  suppliers: Array<{
    supplierId: string;
    name: string;
    purchasesCount: number;
    totalTnd: string;
    rawMaterialsTnd: string;
    resaleTnd: string;
  }>;
  rawMaterials: PurchasedRawMaterial[];
  resaleProducts: PurchasedResaleProduct[];
}

export interface PurchasedRawMaterial {
  rawMaterialId: string;
  name: string;
  unitName: string;
  /// In the base unit.
  quantity: string;
  totalTnd: string;
  purchasesCount: number;
  averagePriceTnd: string | null;
  firstPriceTnd: string;
  lastPriceTnd: string;
  /// Whole percent between the first and the last price of the window.
  priceChangePercent: number;
  lastPurchasedAt: string;
}

export interface PurchasedResaleProduct {
  productId: string;
  name: string;
  unitName: string;
  quantity: string;
  totalTnd: string;
  purchasesCount: number;
  averagePriceTnd: string | null;
  lastPriceTnd: string;
  lastPurchasedAt: string;
  /// Sold over the same window on the three channels.
  soldQuantity: string;
  soldRevenueTnd: string;
  salePriceTnd: string;
  /// Sale price less the last purchase price; `null` without `margin.view`.
  unitMarginTnd: string | null;
}

/// Issue 021: the distributor channel, direct sales and consignment
/// settlements.
export interface AnalyticsDistributors {
  period: AnalyticsPeriod;
  generatedAt: string;
  totals: {
    revenueTnd: string;
    previousRevenueTnd: string;
    directTnd: string;
    consignmentTnd: string;
    documentsCount: number;
    previousDocumentsCount: number;
    activeCount: number;
    /// Returned over everything settled from consignment; `null` when
    /// nothing was settled.
    returnRatePercent: number | null;
    /// `null` without `distribution.balances.view`.
    balanceTnd: string | null;
  };
  trend: Array<{ bucket: string; directTnd: string; consignmentTnd: string }>;
  distributors: DistributorAnalysis[];
  products: DistributorProductAnalysis[];
}

export interface DistributorAnalysis {
  distributorId: string;
  name: string;
  revenueTnd: string;
  directTnd: string;
  consignmentTnd: string;
  documentsCount: number;
  soldQuantity: string;
  returnedQuantity: string;
  returnRatePercent: number | null;
  lastActivityAt: string | null;
  balanceTnd: string | null;
}

export interface DistributorProductAnalysis {
  productId: string;
  name: string;
  unitName: string;
  quantity: string;
  revenueTnd: string;
  returnedQuantity: string;
  returnRatePercent: number | null;
  /// Approximate, on costed lines; `null` without `margin.view` or a cost.
  marginTnd: string | null;
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

export async function getPurchases(
  query: AnalyticsQuery,
): Promise<AnalyticsPurchases> {
  return (
    await apiClient.get<{ purchases: AnalyticsPurchases }>(
      "/analytics/purchases",
      { query: periodParams(query) },
    )
  ).purchases;
}

export async function getDistributors(
  query: AnalyticsQuery,
): Promise<AnalyticsDistributors> {
  return (
    await apiClient.get<{ distributors: AnalyticsDistributors }>(
      "/analytics/distributors",
      { query: periodParams(query) },
    )
  ).distributors;
}
