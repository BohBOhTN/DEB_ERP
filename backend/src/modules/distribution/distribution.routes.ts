import { Router, type Response } from "express";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok } from "../../shared/apiResponse.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { DistributionService } from "./distribution.service.js";

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const createDistributorSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
});

const updateDistributorSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export function distributionRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  distributionService: DistributionService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/distributors",
    requirePermission("distributors.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const distributors =
          await params.distributionService.listDistributors(query);
        response.json(ok({ distributors }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/distributors",
    requirePermission("distributors.create"),
    async (request, response, next) => {
      try {
        const body = createDistributorSchema.parse(request.body);
        const distributor = await params.distributionService.createDistributor(
          body,
          actorFromResponse(response),
        );
        response
          .status(201)
          .json(ok({ distributor }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/distributors/:distributorId",
    requirePermission("distributors.update"),
    async (request, response, next) => {
      try {
        const body = updateDistributorSchema.parse(request.body);
        const distributor = await params.distributionService.updateDistributor(
          parseRouteParam(request.params.distributorId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ distributor }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

function actorFromResponse(response: Response) {
  const user = response.locals.currentUser as { id: string };

  return {
    actorUserId: user.id,
    correlationId: getCorrelationId(response),
  };
}

function parseRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
