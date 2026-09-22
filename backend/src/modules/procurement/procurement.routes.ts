import { PurchasePaymentTerms, PurchaseStatus } from "@prisma/client";
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
import type { ProcurementService } from "./procurement.service.js";

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const purchaseListQuerySchema = z.object({
  supplierId: z.string().trim().min(1).optional(),
  status: z.nativeEnum(PurchaseStatus).optional(),
  paymentTerms: z.nativeEnum(PurchasePaymentTerms).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  dueState: z.enum(["OVERDUE", "UPCOMING"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const supplierBalanceQuerySchema = z.object({
  dueBefore: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const supplierPaymentListQuerySchema = z.object({
  supplierId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
});

const updateSupplierSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const decimalQuantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const createPurchaseSchema = z.object({
  supplierId: z.string().trim().min(1),
  purchaseDate: z.coerce.date(),
  supplierReference: z.string().optional(),
  paymentTerms: z.nativeEnum(PurchasePaymentTerms),
  paidAmountTnd: moneyTnd.default("0"),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        rawMaterialId: z.string().trim().min(1),
        enteredUnitId: z.string().trim().min(1),
        enteredQuantity: decimalQuantity,
        unitPriceTnd: moneyTnd,
      }),
    )
    .min(1),
});

const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(3),
});

const createSupplierPaymentSchema = z.object({
  supplierId: z.string().trim().min(1),
  paidAt: z.coerce.date(),
  amountTnd: moneyTnd,
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z
    .array(
      z.object({
        purchaseId: z.string().trim().min(1),
        amountTnd: moneyTnd,
      }),
    )
    .default([]),
});

export function procurementRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  procurementService: ProcurementService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/suppliers",
    requirePermission("suppliers.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const result = await params.procurementService.listSuppliers(query);
        response.json(ok({ suppliers: result }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/suppliers",
    requirePermission("suppliers.create"),
    async (request, response, next) => {
      try {
        const body = createSupplierSchema.parse(request.body);
        const supplier = await params.procurementService.createSupplier(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok({ supplier }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/suppliers/:supplierId",
    requirePermission("suppliers.update"),
    async (request, response, next) => {
      try {
        const body = updateSupplierSchema.parse(request.body);
        const supplier = await params.procurementService.updateSupplier(
          parseRouteParam(request.params.supplierId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ supplier }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/purchases",
    requirePermission("purchases.view"),
    async (request, response, next) => {
      try {
        const query = purchaseListQuerySchema.parse(request.query);
        const result = await params.procurementService.listPurchases(query);
        response.json(ok({ purchases: result }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/purchases",
    requirePermission("purchases.create"),
    async (request, response, next) => {
      try {
        const body = createPurchaseSchema.parse(request.body);
        const purchase = await params.procurementService.createPurchase(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok({ purchase }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/purchases/:purchaseId/post",
    requirePermission("purchases.post"),
    async (request, response, next) => {
      try {
        const result = await params.procurementService.postPurchase(
          parseRouteParam(request.params.purchaseId),
          {
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
    "/purchases/:purchaseId/cancel",
    requirePermission("purchases.cancel"),
    async (request, response, next) => {
      try {
        const body = cancelPurchaseSchema.parse(request.body);
        const result = await params.procurementService.cancelPurchase(
          parseRouteParam(request.params.purchaseId),
          {
            idempotencyKey: readIdempotencyKey(request.headers),
            reason: body.reason,
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
    "/supplier-balances",
    requirePermission("supplier_balances.view"),
    async (request, response, next) => {
      try {
        const query = supplierBalanceQuerySchema.parse(request.query);
        const result =
          await params.procurementService.listSupplierBalances(query);
        response.json(
          ok({ supplierBalances: result }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/suppliers/:supplierId/statement",
    requirePermission("supplier_balances.view"),
    async (request, response, next) => {
      try {
        const statement = await params.procurementService.getSupplierStatement(
          parseRouteParam(request.params.supplierId),
        );
        response.json(ok({ statement }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/supplier-payments",
    requirePermission("supplier_payments.view"),
    async (request, response, next) => {
      try {
        const query = supplierPaymentListQuerySchema.parse(request.query);
        const result =
          await params.procurementService.listSupplierPayments(query);
        response.json(
          ok({ supplierPayments: result }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/supplier-payments",
    requirePermission("supplier_payments.create"),
    async (request, response, next) => {
      try {
        const body = createSupplierPaymentSchema.parse(request.body);
        const result = await params.procurementService.createSupplierPayment(
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

function parseRouteParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Les données saisies sont invalides.",
    });
  }

  return value;
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
