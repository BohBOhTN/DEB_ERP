import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok } from "../../shared/apiResponse.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { AuditService } from "./audit.service.js";

const listQuerySchema = z.object({
  actorUserId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  entity: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  correlationId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function auditRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  auditService: AuditService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  // AUD-005: audit access requires audit.view, and nothing here writes.
  router.get(
    "/audit-events",
    requirePermission("audit.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const auditEvents = await params.auditService.listEvents(query);
        response.json(ok({ auditEvents }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/audit-filters",
    requirePermission("audit.view"),
    async (_request, response, next) => {
      try {
        const auditFilters = await params.auditService.listFilterOptions();
        response.json(ok({ auditFilters }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
