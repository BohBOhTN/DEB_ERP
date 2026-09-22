import { DistributorDispatchStatus } from "@prisma/client";
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

const dispatchListQuerySchema = z.object({
  distributorId: z.string().trim().min(1).optional(),
  status: z.nativeEnum(DistributorDispatchStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const custodyQuerySchema = z.object({
  distributorId: z.string().trim().min(1).optional(),
});

const dispatchSchema = z.object({
  distributorId: z.string().trim().min(1),
  dispatchedAt: z.coerce.date(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity,
      }),
    )
    .min(1),
});

const settlementSchema = z.object({
  dispatchId: z.string().trim().min(1),
  settledAt: z.coerce.date(),
  paidAmountTnd: moneyTnd.optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        dispatchLineId: z.string().trim().min(1),
        soldQuantity: quantity.optional(),
        returnedQuantity: quantity.optional(),
        unaccountedQuantity: quantity.optional(),
        unitPriceTnd: moneyTnd,
      }),
    )
    .min(1),
});

const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const paymentListQuerySchema = pageQuerySchema.extend({
  distributorId: z.string().trim().min(1).optional(),
});

const createPaymentSchema = z.object({
  distributorId: z.string().trim().min(1),
  paidAt: z.coerce.date(),
  amountTnd: moneyTnd,
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z
    .array(
      z.object({
        saleId: z.string().trim().min(1).optional(),
        settlementId: z.string().trim().min(1).optional(),
        amountTnd: moneyTnd,
      }),
    )
    .default([]),
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

  router.get(
    "/distributor-dispatches",
    requirePermission("distribution.custody.view"),
    async (request, response, next) => {
      try {
        const query = dispatchListQuerySchema.parse(request.query);
        const dispatches =
          await params.distributionService.listDispatches(query);
        response.json(ok({ dispatches }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/distributor-dispatches/:dispatchId",
    requirePermission("distribution.custody.view"),
    async (request, response, next) => {
      try {
        const dispatch = await params.distributionService.getDispatch(
          parseRouteParam(request.params.dispatchId),
        );
        response.json(ok({ dispatch }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/distributor-dispatches",
    requirePermission("distribution.dispatch"),
    async (request, response, next) => {
      try {
        const body = dispatchSchema.parse(request.body);
        const result = await params.distributionService.dispatchConsignment(
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

  router.post(
    "/distributor-settlements",
    requirePermission("distribution.settle"),
    async (request, response, next) => {
      try {
        const body = settlementSchema.parse(request.body);
        const result = await params.distributionService.postSettlement(
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

  router.get(
    "/distributor-custody",
    requirePermission("distribution.custody.view"),
    async (request, response, next) => {
      try {
        const query = custodyQuerySchema.parse(request.query);
        const custody = await params.distributionService.listCustody(query);
        response.json(ok({ custody }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/distributor-balances",
    requirePermission("distribution.balances.view"),
    async (request, response, next) => {
      try {
        const query = pageQuerySchema.parse(request.query);
        const distributorBalances =
          await params.distributionService.listDistributorBalances(query);
        response.json(ok({ distributorBalances }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/distributors/:distributorId/statement",
    requirePermission("distribution.balances.view"),
    async (request, response, next) => {
      try {
        const statement =
          await params.distributionService.getDistributorStatement(
            parseRouteParam(request.params.distributorId),
          );
        response.json(ok({ statement }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/distributor-payments",
    requirePermission("distributor_payments.view"),
    async (request, response, next) => {
      try {
        const query = paymentListQuerySchema.parse(request.query);
        const distributorPayments =
          await params.distributionService.listDistributorPayments(query);
        response.json(ok({ distributorPayments }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/distributor-payments",
    requirePermission("distributor_payments.create"),
    async (request, response, next) => {
      try {
        const body = createPaymentSchema.parse(request.body);
        const result =
          await params.distributionService.createDistributorPayment(
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
