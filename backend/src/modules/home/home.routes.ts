import { Router } from "express";
import { z } from "zod";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor } from "../../shared/apiResponse.js";
import type { HomeService } from "./home.service.js";

export const summaryQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/// The home page is open to every authenticated user (UI-08): the service
/// includes only the blocks the caller may see, and a user with no block
/// permission receives the empty summary the screen renders as its empty state.
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

  router.get("/summary", async (request, response, next) => {
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
  });

  return router;
}
