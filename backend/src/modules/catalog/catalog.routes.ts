import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { requirePermission } from "../access/permission.middleware.js";
import { ok } from "../../shared/apiResponse.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { CatalogService } from "./catalog.service.js";

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const createUnitSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  precision: z.number().int().min(0).max(6).default(3),
});

const updateUnitSchema = z.object({
  name: z.string().trim().min(1).optional(),
  symbol: z.string().trim().min(1).optional(),
  precision: z.number().int().min(0).max(6).optional(),
  isActive: z.boolean().optional(),
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export function catalogRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  catalogService: CatalogService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/units",
    requirePermission("units.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const result = await params.catalogService.listUnits(query);
        response.json(ok({ units: result }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/units",
    requirePermission("units.manage"),
    async (request, response, next) => {
      try {
        const body = createUnitSchema.parse(request.body);
        const unit = await params.catalogService.createUnit(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok({ unit }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/units/:unitId",
    requirePermission("units.manage"),
    async (request, response, next) => {
      try {
        const body = updateUnitSchema.parse(request.body);
        const unit = await params.catalogService.updateUnit(
          parseRouteParam(request.params.unitId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ unit }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/categories",
    requirePermission("categories.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const result = await params.catalogService.listCategories(query);
        response.json(ok({ categories: result }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/categories",
    requirePermission("categories.manage"),
    async (request, response, next) => {
      try {
        const body = createCategorySchema.parse(request.body);
        const category = await params.catalogService.createCategory(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok({ category }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/categories/:categoryId",
    requirePermission("categories.manage"),
    async (request, response, next) => {
      try {
        const body = updateCategorySchema.parse(request.body);
        const category = await params.catalogService.updateCategory(
          parseRouteParam(request.params.categoryId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ category }, getCorrelationId(response)));
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
