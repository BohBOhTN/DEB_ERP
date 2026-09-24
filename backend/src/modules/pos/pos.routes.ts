import { PosSessionStatus, SalePaymentState } from "@prisma/client";
import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import {
  requireAnyPermission,
  requirePermission,
} from "../access/permission.middleware.js";
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
import type { PosService } from "./pos.service.js";

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const quantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

export const listQuerySchema = z.object({
  sort: sortField(["name"]),
  ...searchFields,
  ...pageFields,
});

export const saleListQuerySchema = z.object({
  sort: sortField(["soldAt", "totalTnd"]),
  ...dateRangeFields,
  customerId: z.string().trim().min(1).optional(),
  paymentState: z.nativeEnum(SalePaymentState).optional(),
  cashierUserId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  ...pageFields,
});

export const sessionListQuerySchema = z.object({
  ...pageFields,
  ...dateRangeFields,
  status: z.nativeEnum(PosSessionStatus).optional(),
  cashierUserId: z.string().trim().min(1).optional(),
  sort: sortField(["openedAt"]),
});

export const openSessionSchema = z.object({
  openingCashTnd: moneyTnd,
  openedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

export const closeSessionSchema = z.object({
  countedCashTnd: moneyTnd,
  closedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

export const postSaleSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  customerId: z.string().trim().min(1).optional(),
  paidAmountTnd: moneyTnd.optional(),
  soldAt: z.coerce.date().default(() => new Date()),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity,
      }),
    )
    .min(1),
});

export function posRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  posService: PosService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/products",
    requirePermission("pos.access"),
    async (request, response, next) => {
      try {
        const query = withSearch(listQuerySchema.parse(request.query));
        const products = await params.posService.listProducts(query);
        response.json(okFor(response, { products }));
      } catch (error) {
        next(error);
      }
    },
  );

  // A cashier selects a registered customer either for a credit sale or for an
  // order for later, so either permission opens this lookup.
  router.get(
    "/customers",
    requireAnyPermission(["pos.credit_sale", "orders.create"]),
    async (request, response, next) => {
      try {
        const query = withSearch(listQuerySchema.parse(request.query));
        const customers = await params.posService.listCustomers(query);
        response.json(okFor(response, { customers }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/sessions/current",
    requirePermission("pos.access"),
    async (_request, response, next) => {
      try {
        const session = await params.posService.getCurrentSession();
        response.json(okFor(response, { session }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/sessions/open",
    requirePermission("pos.open_session"),
    async (request, response, next) => {
      try {
        const body = openSessionSchema.parse(request.body);
        const result = await params.posService.openSession(
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

  router.post(
    "/sessions/:sessionId/close",
    requirePermission("pos.close_session"),
    async (request, response, next) => {
      try {
        const body = closeSessionSchema.parse(request.body);
        const result = await params.posService.closeSession(
          String(request.params.sessionId),
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
    "/sales",
    requirePermission("pos.access"),
    async (request, response, next) => {
      try {
        const query = saleListQuerySchema.parse(request.query);
        const sales = await params.posService.listSales(query);
        response.json(okFor(response, { sales }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/sales",
    requirePermission("pos.sell"),
    async (request, response, next) => {
      try {
        const body = postSaleSchema.parse(request.body);
        const result = await params.posService.postPaidSale(
          {
            ...body,
            idempotencyKey: readIdempotencyKey(request.headers),
            // Only a sale that leaves a remainder needs pos.credit_sale; the
            // service knows the total, so it decides (issue #43).
            creditAllowed: hasPermission(response, "pos.credit_sale"),
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
    "/sales/:saleId",
    requirePermission("pos.access"),
    async (request, response, next) => {
      try {
        const sale = await params.posService.getSale(
          parseRouteParam(request.params.saleId),
        );
        response.json(okFor(response, { sale }));
      } catch (error) {
        next(error);
      }
    },
  );

  // Registered after /sessions/current and /sessions/open so those literal
  // paths win over the parameter.
  router.get(
    "/sessions",
    requirePermission("pos.access"),
    async (request, response, next) => {
      try {
        const query = sessionListQuerySchema.parse(request.query);
        const sessions = await params.posService.listSessions(query);
        response.json(okFor(response, { sessions }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/sessions/:sessionId",
    requirePermission("pos.access"),
    async (request, response, next) => {
      try {
        const result = await params.posService.getSession(
          parseRouteParam(request.params.sessionId),
        );
        response.json(okFor(response, result));
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

function hasPermission(response: Response, permission: string): boolean {
  const user = response.locals.currentUser as {
    effectivePermissions: string[];
  };

  return user.effectivePermissions.includes(permission);
}

function parseRouteParam(value: string | string[] | undefined): string {
  const id = Array.isArray(value) ? value[0] : value;

  if (!id || !id.trim()) {
    throw new AppError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Identifiant invalide.",
    });
  }

  return id;
}
