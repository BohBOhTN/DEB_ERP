import { InventoryItemType } from "@prisma/client";
import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok, sendCommandResult } from "../../shared/apiResponse.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { InventoryService } from "./inventory.service.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const inventoryCommandSchema = z.object({
  itemType: z.nativeEnum(InventoryItemType),
  itemId: z.string().trim().min(1),
  reason: z.string().trim().min(3),
});

const openingStockSchema = inventoryCommandSchema.extend({
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/),
});

const adjustmentSchema = inventoryCommandSchema.extend({
  quantityDelta: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,6})?$/),
});

export function inventoryRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  inventoryService: InventoryService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/balances",
    requirePermission("inventory.view"),
    async (_request, response, next) => {
      try {
        const balances = await params.inventoryService.listBalances();
        response.json(ok({ balances }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/movements",
    requirePermission("inventory.movements.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const movements = await params.inventoryService.listMovements(query);
        response.json(ok({ movements }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/opening-stock",
    requirePermission("inventory.opening_stock"),
    async (request, response, next) => {
      try {
        const body = openingStockSchema.parse(request.body);
        const result = await params.inventoryService.postOpeningStock(
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
    "/adjustments",
    requirePermission("inventory.adjust"),
    async (request, response, next) => {
      try {
        const body = adjustmentSchema.parse(request.body);
        const result = await params.inventoryService.postAdjustment(
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
