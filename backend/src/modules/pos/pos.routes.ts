import { SalePaymentState } from "@prisma/client";
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
import { ok } from "../../shared/apiResponse.js";
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

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const saleListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  customerId: z.string().trim().min(1).optional(),
  paymentState: z.nativeEnum(SalePaymentState).optional(),
  cashierUserId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const openSessionSchema = z.object({
  openingCashTnd: moneyTnd,
  openedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

const closeSessionSchema = z.object({
  countedCashTnd: moneyTnd,
  closedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

const postSaleSchema = z.object({
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
        const query = listQuerySchema.parse(request.query);
        const products = await params.posService.listProducts(query);
        response.json(ok({ products }, getCorrelationId(response)));
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
        const query = listQuerySchema.parse(request.query);
        const customers = await params.posService.listCustomers(query);
        response.json(ok({ customers }, getCorrelationId(response)));
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
        response.json(ok({ session }, getCorrelationId(response)));
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
        response.status(201).json(ok(result, getCorrelationId(response)));
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
        response.status(201).json(ok(result, getCorrelationId(response)));
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
        response.json(ok({ sales }, getCorrelationId(response)));
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
        assertCreditSalePermission(body.paidAmountTnd, response);
        const result = await params.posService.postPaidSale(
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
      message: "Une cle d'idempotence est requise.",
    });
  }

  return value;
}

function assertCreditSalePermission(
  paidAmountTnd: string | undefined,
  response: Response,
) {
  if (paidAmountTnd === undefined) {
    return;
  }

  const user = response.locals.currentUser as {
    effectivePermissions: string[];
  };

  if (!user.effectivePermissions.includes("pos.credit_sale")) {
    throw new AppError({
      statusCode: 403,
      code: "PERMISSION_DENIED",
      message: "Vous n'avez pas l'autorisation necessaire.",
    });
  }
}
