import { PurchasePaymentTerms, PurchaseStatus } from "@prisma/client";
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
import type { ProcurementService } from "./procurement.service.js";

export const listQuerySchema = z.object({
  sort: sortField(["name", "createdAt"]),
  ...searchFields,
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  ...pageFields,
});

export const purchaseListQuerySchema = z.object({
  sort: sortField(["purchaseDate", "totalTnd", "dueDate"]),
  supplierId: z.string().trim().min(1).optional(),
  status: z.nativeEnum(PurchaseStatus).optional(),
  paymentTerms: z.nativeEnum(PurchasePaymentTerms).optional(),
  rawMaterialId: z.string().trim().min(1).optional(),
  ...dateRangeFields,
  dueState: z.enum(["OVERDUE", "UPCOMING"]).optional(),
  ...pageFields,
});

export const supplierBalanceQuerySchema = z.object({
  dueBefore: z.coerce.date().optional(),
  ...searchFields,
  sort: z.enum(["name", "balance"]).optional(),
  minBalance: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/)
    .optional(),
  ...pageFields,
});

export const statementQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  ...dateRangeFields,
});

export const supplierPaymentListQuerySchema = z.object({
  sort: sortField(["paidAt", "amountTnd"]),
  supplierId: z.string().trim().min(1).optional(),
  ...pageFields,
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
});

export const updateSupplierSchema = z.object({
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

export const createPurchaseSchema = z.object({
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

export const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(3),
});

export const createSupplierPaymentSchema = z.object({
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
        const query = withSearch(listQuerySchema.parse(request.query));
        const result = await params.procurementService.listSuppliers(query);
        response.json(okFor(response, { suppliers: result }));
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
        response.status(201).json(okFor(response, { supplier }));
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
        response.json(okFor(response, { supplier }));
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
        response.json(okFor(response, { purchases: result }));
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
        response.status(201).json(okFor(response, { purchase }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/purchases/:purchaseId",
    requirePermission("purchases.create"),
    async (request, response, next) => {
      try {
        const body = createPurchaseSchema.parse(request.body);
        const purchase = await params.procurementService.updateDraftPurchase(
          parseRouteParam(request.params.purchaseId),
          body,
          actorFromResponse(response),
        );
        response.json(okFor(response, { purchase }));
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
        const query = withSearch(
          supplierBalanceQuerySchema.parse(request.query),
        );
        const result =
          await params.procurementService.listSupplierBalances(query);
        response.json(okFor(response, { supplierBalances: result }));
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
          statementQuerySchema.parse(request.query),
        );
        response.json(okFor(response, { statement }));
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
        response.json(okFor(response, { supplierPayments: result }));
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

  router.get(
    "/suppliers/:supplierId",
    requirePermission("suppliers.view"),
    async (request, response, next) => {
      try {
        const supplier = await params.procurementService.getSupplier(
          parseRouteParam(request.params.supplierId),
        );
        response.json(okFor(response, { supplier }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/purchases/:purchaseId",
    requirePermission("purchases.view"),
    async (request, response, next) => {
      try {
        const purchase = await params.procurementService.getPurchase(
          parseRouteParam(request.params.purchaseId),
        );
        response.json(okFor(response, { purchase }));
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
