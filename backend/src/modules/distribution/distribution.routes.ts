import { DistributorDispatchStatus } from "@prisma/client";
import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor, sendCommandResult } from "../../shared/apiResponse.js";
import {
  dateRangeFields,
  pageFields,
  searchFields,
  sortField,
  withSearch,
} from "../../shared/listQuery.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { DistributionService } from "./distribution.service.js";

export const listQuerySchema = z.object({
  sort: sortField(["name", "createdAt"]),
  ...searchFields,
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  ...pageFields,
});

export const createDistributorSchema = z.object({
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

export const directSaleSchema = z.object({
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

export const dispatchListQuerySchema = z.object({
  sort: sortField(["dispatchedAt"]),
  distributorId: z.string().trim().min(1).optional(),
  status: z.nativeEnum(DistributorDispatchStatus).optional(),
  ...pageFields,
});

export const settlementListQuerySchema = z.object({
  sort: sortField(["settledAt", "totalTnd"]),
  distributorId: z.string().trim().min(1).optional(),
  dispatchId: z.string().trim().min(1).optional(),
  ...dateRangeFields,
  ...pageFields,
});

export const custodyQuerySchema = z.object({
  distributorId: z.string().trim().min(1).optional(),
});

export const dispatchSchema = z.object({
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

export const settlementSchema = z.object({
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

export const pageQuerySchema = z.object({
  ...pageFields,
});

export const paymentListQuerySchema = pageQuerySchema.extend({
  sort: sortField(["paidAt", "amountTnd"]),
  distributorId: z.string().trim().min(1).optional(),
});

export const balanceListQuerySchema = pageQuerySchema.extend({
  ...searchFields,
  sort: z.enum(["name", "balance"]).optional(),
  minBalance: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/)
    .optional(),
});

export const statementQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  ...dateRangeFields,
});

export const createPaymentSchema = z.object({
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

export const updateDistributorSchema = z.object({
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
        const query = withSearch(listQuerySchema.parse(request.query));
        const distributors =
          await params.distributionService.listDistributors(query);
        response.json(okFor(response, { distributors }));
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
        response.status(201).json(okFor(response, { distributor }));
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
        response.json(okFor(response, { distributor }));
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
        sendCommandResult(response, 201, result);
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
        response.json(okFor(response, { dispatches }));
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
        response.json(okFor(response, { dispatch }));
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
        sendCommandResult(response, 201, result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/distributor-settlements",
    requirePermission("distribution.custody.view"),
    async (request, response, next) => {
      try {
        const query = settlementListQuerySchema.parse(request.query);
        const settlements =
          await params.distributionService.listSettlements(query);
        response.json(okFor(response, { settlements }));
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
        sendCommandResult(response, 201, result);
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
        response.json(okFor(response, { custody }));
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
        const query = withSearch(balanceListQuerySchema.parse(request.query));
        const distributorBalances =
          await params.distributionService.listDistributorBalances(query);
        response.json(okFor(response, { distributorBalances }));
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
            statementQuerySchema.parse(request.query),
          );
        response.json(okFor(response, { statement }));
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
        response.json(okFor(response, { distributorPayments }));
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
        sendCommandResult(response, 201, result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/distributors/:distributorId",
    requirePermission("distributors.view"),
    async (request, response, next) => {
      try {
        const distributor = await params.distributionService.getDistributor(
          parseRouteParam(request.params.distributorId),
        );
        response.json(okFor(response, { distributor }));
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
      message: "Une clé d'idempotence est requise.",
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
