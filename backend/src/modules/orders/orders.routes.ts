import {
  CustomerOrderAdvanceDisposition,
  CustomerOrderStatus,
} from "@prisma/client";
import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor, sendCommandResult } from "../../shared/apiResponse.js";
import {
  pageFields,
  searchFields,
  sortField,
  withSearch,
} from "../../shared/listQuery.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { OrdersService } from "./orders.service.js";

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const quantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

export const orderLineSchema = z.object({
  productId: z.string().trim().min(1),
  quantity,
});

const orderFilterFields = {
  status: z.nativeEnum(CustomerOrderStatus).optional(),
  customerId: z.string().trim().min(1).optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  dueState: z.enum(["OVERDUE", "UPCOMING"]).optional(),
  ...searchFields,
};

export const listQuerySchema = z.object({
  sort: sortField(["requestedFulfillmentAt", "createdAt", "totalTnd"]),
  ...orderFilterFields,
  ...pageFields,
});

/// The KPI row above the queue takes the list's filters without paging.
export const summaryQuerySchema = z.object(orderFilterFields);

export const createOrderSchema = z.object({
  customerId: z.string().trim().min(1),
  requestedFulfillmentAt: z.coerce.date(),
  notes: z.string().optional(),
  lines: z.array(orderLineSchema).min(1),
});

export const updateOrderSchema = z.object({
  version: z.number().int().positive(),
  requestedFulfillmentAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  lines: z.array(orderLineSchema).min(1).optional(),
});

/// COMPLETED and CANCELLED are reachable only through their own commands,
/// which carry the stock, revenue and money effects.
export const changeStatusSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum([
    CustomerOrderStatus.CONFIRMED,
    CustomerOrderStatus.PREPARING,
    CustomerOrderStatus.READY,
  ]),
});

export const advanceSchema = z.object({
  amountTnd: moneyTnd,
  paidAt: z.coerce.date(),
  notes: z.string().optional(),
});

/// The amount paid at completion is always stated (issue #45): "0.000"
/// leaves the remainder on the customer's account, nothing is inferred.
export const completeOrderSchema = z.object({
  completedAt: z.coerce.date(),
  paidAmountTnd: moneyTnd,
});

export const cancelOrderSchema = z.object({
  cancelledAt: z.coerce.date(),
  reason: z.string().trim().min(1),
  advanceDisposition: z.nativeEnum(CustomerOrderAdvanceDisposition).optional(),
});

export function ordersRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  ordersService: OrdersService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/orders",
    requirePermission("orders.view"),
    async (request, response, next) => {
      try {
        const query = withSearch(listQuerySchema.parse(request.query));
        const orders = await params.ordersService.listOrders(query);
        response.json(okFor(response, { orders }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/orders/summary",
    requirePermission("orders.view"),
    async (request, response, next) => {
      try {
        const query = withSearch(summaryQuerySchema.parse(request.query));
        const summary = await params.ordersService.summarizeOrders(query);
        response.json(okFor(response, { summary }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/orders/:orderId",
    requirePermission("orders.view"),
    async (request, response, next) => {
      try {
        const order = await params.ordersService.getOrder(
          parseRouteParam(request.params.orderId),
        );
        response.json(okFor(response, { order }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/orders",
    requirePermission("orders.create"),
    async (request, response, next) => {
      try {
        const body = createOrderSchema.parse(request.body);
        const result = await params.ordersService.createOrder(
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

  router.patch(
    "/orders/:orderId",
    requirePermission("orders.update"),
    async (request, response, next) => {
      try {
        const body = updateOrderSchema.parse(request.body);
        const result = await params.ordersService.updateOrder(
          parseRouteParam(request.params.orderId),
          body,
          actorFromResponse(response),
        );
        response.json(okFor(response, result));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/orders/:orderId/status",
    requirePermission("orders.change_status"),
    async (request, response, next) => {
      try {
        const body = changeStatusSchema.parse(request.body);
        const result = await params.ordersService.changeOrderStatus(
          parseRouteParam(request.params.orderId),
          body,
          actorFromResponse(response),
        );
        response.json(okFor(response, result));
      } catch (error) {
        next(error);
      }
    },
  );

  // Collecting an advance both mutates the order and takes customer money, so
  // it requires the permission for each effect.
  router.post(
    "/orders/:orderId/advances",
    requirePermission("orders.update"),
    requirePermission("customer_payments.create"),
    async (request, response, next) => {
      try {
        const body = advanceSchema.parse(request.body);
        const result = await params.ordersService.recordOrderAdvance(
          parseRouteParam(request.params.orderId),
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
    "/orders/:orderId/complete",
    requirePermission("orders.complete"),
    async (request, response, next) => {
      try {
        const body = completeOrderSchema.parse(request.body);
        const result = await params.ordersService.completeOrder(
          parseRouteParam(request.params.orderId),
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
    "/orders/:orderId/cancel",
    requirePermission("orders.cancel"),
    async (request, response, next) => {
      try {
        const body = cancelOrderSchema.parse(request.body);
        const result = await params.ordersService.cancelOrder(
          parseRouteParam(request.params.orderId),
          {
            ...body,
            idempotencyKey: readIdempotencyKey(request.headers),
          },
          actorFromResponse(response),
        );
        sendCommandResult(response, 200, result);
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
