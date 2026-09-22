import { Router } from "express";
import { z } from "zod";
import { requireAnyPermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor } from "../../shared/apiResponse.js";
import type { HomeService } from "./home.service.js";

const summaryQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/// Any of the block permissions opens the summary; the service then includes
/// only the blocks the caller may see. A user with none of them has nothing
/// to see and is refused like on any other screen.
export const homeSummaryPermissions = [
  "pos.access",
  "customer_balances.view",
  "distribution.balances.view",
  "supplier_balances.view",
  "orders.view",
  "inventory.view",
  "expenses.view",
  "distribution.custody.view",
  "audit.view",
];

export function homeRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  homeService: HomeService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/summary",
    requireAnyPermission(homeSummaryPermissions),
    async (request, response, next) => {
      try {
        const query = summaryQuerySchema.parse(request.query);
        const user = response.locals.currentUser as {
          effectivePermissions: string[];
        };
        const summary = await params.homeService.getSummary({
          date: query.date,
          permissions: new Set(user.effectivePermissions),
        });
        response.json(okFor(response, { summary }));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
