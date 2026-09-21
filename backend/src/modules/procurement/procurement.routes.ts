import { Router, type Response } from "express";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok } from "../../shared/apiResponse.js";
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
      message: "Les donnees saisies sont invalides.",
    });
  }

  return value;
}
