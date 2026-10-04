import { Router, type Response } from "express";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor } from "../../shared/apiResponse.js";
import type { AnalyticsService } from "./analytics.service.js";
import { resolvePeriod } from "./period.js";

const businessDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

/// Both bounds are business days in Tunis; the last thirty days by default.
export const periodQuerySchema = z.object({
  from: businessDay,
  to: businessDay,
});

/// DEC-V2-006: the analyses are read-only and sit behind `analytics.view`.
/// The service leaves out the blocks of the permissions the caller lacks.
export function analyticsRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  analyticsService: AnalyticsService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  const paramsOf = (query: unknown, response: Response) => {
    const user = response.locals.currentUser as {
      effectivePermissions: string[];
    };

    return {
      period: resolvePeriod(periodQuerySchema.parse(query)),
      permissions: new Set(user.effectivePermissions),
    };
  };

  router.get(
    "/overview",
    requirePermission("analytics.view"),
    async (request, response, next) => {
      try {
        const overview = await params.analyticsService.getOverview(
          paramsOf(request.query, response),
        );
        response.json(okFor(response, { overview }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/frequency",
    requirePermission("analytics.view"),
    async (request, response, next) => {
      try {
        const frequency = await params.analyticsService.getFrequency(
          paramsOf(request.query, response),
        );
        response.json(okFor(response, { frequency }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/products",
    requirePermission("analytics.view"),
    async (request, response, next) => {
      try {
        const products = await params.analyticsService.getProducts(
          paramsOf(request.query, response),
        );
        response.json(okFor(response, { products }));
      } catch (error) {
        next(error);
      }
    },
  );

  // Names and buying habits of customers: the customer list permission too.
  router.get(
    "/customers",
    requirePermission("analytics.view"),
    requirePermission("customers.view"),
    async (request, response, next) => {
      try {
        const customers = await params.analyticsService.getCustomers(
          paramsOf(request.query, response),
        );
        response.json(okFor(response, { customers }));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
