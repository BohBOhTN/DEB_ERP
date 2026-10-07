import { useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import * as api from "./analytics.api.js";

export const analyticsKeys = {
  all: ["analytics"] as const,
  overview: (query: api.AnalyticsQuery) =>
    ["analytics", "overview", query] as const,
  frequency: (query: api.AnalyticsQuery) =>
    ["analytics", "frequency", query] as const,
  products: (query: api.AnalyticsQuery) =>
    ["analytics", "products", query] as const,
  customers: (query: api.AnalyticsQuery) =>
    ["analytics", "customers", query] as const,
  purchases: (query: api.AnalyticsQuery) =>
    ["analytics", "purchases", query] as const,
  distributors: (query: api.AnalyticsQuery) =>
    ["analytics", "distributors", query] as const,
};

/// Analyses read history: the `list` tier, with the previous period kept on
/// screen while the next one loads so the charts do not blink.
const options = {
  placeholderData: <T>(previous: T | undefined) => previous,
  ...tier("list"),
};

export function useAnalyticsOverview(query: api.AnalyticsQuery) {
  return useQuery({
    queryKey: analyticsKeys.overview(query),
    queryFn: () => api.getOverview(query),
    ...options,
  });
}

export function useAnalyticsFrequency(query: api.AnalyticsQuery) {
  return useQuery({
    queryKey: analyticsKeys.frequency(query),
    queryFn: () => api.getFrequency(query),
    ...options,
  });
}

export function useAnalyticsProducts(query: api.AnalyticsQuery) {
  return useQuery({
    queryKey: analyticsKeys.products(query),
    queryFn: () => api.getProducts(query),
    ...options,
  });
}

export function useAnalyticsCustomers(query: api.AnalyticsQuery) {
  return useQuery({
    queryKey: analyticsKeys.customers(query),
    queryFn: () => api.getCustomers(query),
    ...options,
  });
}

export function useAnalyticsPurchases(query: api.AnalyticsQuery) {
  return useQuery({
    queryKey: analyticsKeys.purchases(query),
    queryFn: () => api.getPurchases(query),
    ...options,
  });
}

export function useAnalyticsDistributors(query: api.AnalyticsQuery) {
  return useQuery({
    queryKey: analyticsKeys.distributors(query),
    queryFn: () => api.getDistributors(query),
    ...options,
  });
}
