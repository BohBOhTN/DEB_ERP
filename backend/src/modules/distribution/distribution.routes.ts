import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok } from "../../shared/apiResponse.js";
import { AppError } from "../../shared/appError.js";
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

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const quantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

const directSaleSchema = z.object({
  distributorId: z.string().trim().min(1),
  soldAt: z.coerce.date(),
  paidAmountTnd: moneyTnd.optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity,
        unitPriceTnd: moneyTnd,
      }),
    )
    .min(1),
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

  router.post(
    "/distributor-sales",
    requirePermission("distribution.direct_sale"),
    async (request, response, next) => {
      try {
        const body = directSaleSchema.parse(request.body);
        const result = await params.distributionService.postDirectSale(
          {
            ...body,
            idempotencyKey: readIdempotencyKey(request.headers),
          },
          actorFromResponse(response),
        );
        response.status(201).json(ok(result, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

function readIdempotencyKey(headers: IncomingHttpHeaders): string {
  const value = headers["idempotency-key"];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  if (!value) {
    throw new AppError({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "Une cle d'idempotence est requise.",
    });
  }

  return value;
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
