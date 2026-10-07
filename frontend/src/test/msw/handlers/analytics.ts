import { http } from "msw";
import type {
  AnalyticsCustomers,
  AnalyticsDistributors,
  AnalyticsFrequency,
  AnalyticsOverview,
  AnalyticsProducts,
  AnalyticsPurchases,
} from "../../../features/analytics/analytics.api.js";
import {
  makeAnalyticsCustomers,
  makeAnalyticsDistributors,
  makeAnalyticsFrequency,
  makeAnalyticsOverview,
  makeAnalyticsProducts,
  makeAnalyticsPurchases,
} from "../../factories/analytics.js";
import { apiV1, ok } from "../envelope.js";

export interface AnalyticsFixtures {
  overview?: AnalyticsOverview;
  frequency?: AnalyticsFrequency;
  products?: AnalyticsProducts;
  customers?: AnalyticsCustomers;
  purchases?: AnalyticsPurchases;
  distributors?: AnalyticsDistributors;
  /// Called with the `from` and `to` of every request, to assert the period.
  onRequest?: (
    endpoint: string,
    from: string | null,
    to: string | null,
  ) => void;
}

export function analyticsHandlers(fixtures: AnalyticsFixtures = {}) {
  const seen = (endpoint: string, request: Request) => {
    const url = new URL(request.url);
    fixtures.onRequest?.(
      endpoint,
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    );
  };

  return [
    http.get(`${apiV1}/analytics/overview`, ({ request }) => {
      seen("overview", request);
      return ok({ overview: fixtures.overview ?? makeAnalyticsOverview() });
    }),
    http.get(`${apiV1}/analytics/frequency`, ({ request }) => {
      seen("frequency", request);
      return ok({ frequency: fixtures.frequency ?? makeAnalyticsFrequency() });
    }),
    http.get(`${apiV1}/analytics/products`, ({ request }) => {
      seen("products", request);
      return ok({ products: fixtures.products ?? makeAnalyticsProducts() });
    }),
    http.get(`${apiV1}/analytics/customers`, ({ request }) => {
      seen("customers", request);
      return ok({ customers: fixtures.customers ?? makeAnalyticsCustomers() });
    }),
    http.get(`${apiV1}/analytics/purchases`, ({ request }) => {
      seen("purchases", request);
      return ok({ purchases: fixtures.purchases ?? makeAnalyticsPurchases() });
    }),
    http.get(`${apiV1}/analytics/distributors`, ({ request }) => {
      seen("distributors", request);
      return ok({
        distributors: fixtures.distributors ?? makeAnalyticsDistributors(),
      });
    }),
  ];
}
