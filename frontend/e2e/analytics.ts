import {
  makeAnalyticsCustomers,
  makeAnalyticsFrequency,
  makeAnalyticsOverview,
  makeAnalyticsProducts,
} from "../src/test/factories/analytics";

/// Issue 014: the analyses as the shell mock answers them, from the same
/// fixtures the unit tests use (an owner's September), so the browser runs
/// draw real charts.
export function analyticsResponse(path: string): unknown {
  switch (path) {
    case "/analytics/overview":
      return { overview: makeAnalyticsOverview() };
    case "/analytics/frequency":
      return { frequency: makeAnalyticsFrequency() };
    case "/analytics/products":
      return { products: makeAnalyticsProducts() };
    case "/analytics/customers":
      return { customers: makeAnalyticsCustomers() };
    default:
      return null;
  }
}

/// The session history totals of a till that has not been used yet.
export const emptySessionsSummary = {
  count: 0,
  openCount: 0,
  closedCount: 0,
  salesCount: 0,
  salesTotalTnd: "0.000",
  differenceTnd: "0.000",
  shortageTnd: "0.000",
  surplusTnd: "0.000",
  withDifferenceCount: 0,
};
