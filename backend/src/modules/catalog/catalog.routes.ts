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

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

const createRawMaterialSchema = z.object({
  code: z.string().optional(),
  name: z.string().trim().min(1),
  category: z.string().optional(),
  baseUnitId: z.string().trim().min(1),
  notes: z.string().optional(),
  conversions: z
    .array(
      z.object({
        unitId: z.string().trim().min(1),
        factorToBase: decimalString,
      }),
    )
    .default([]),
});

const updateRawMaterialSchema = z.object({
  version: z.number().int().positive(),
  code: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  baseUnitId: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
});

const replaceRawMaterialConversionsSchema = z.object({
  version: z.number().int().positive(),
  conversions: z.array(
    z.object({
      unitId: z.string().trim().min(1),
      factorToBase: decimalString,
    }),
  ),
});

const activationSchema = z.object({
  version: z.number().int().positive(),
  isActive: z.boolean(),
});

const createProductSchema = z.object({
  code: z.string().optional(),
  barcode: z.string().optional(),
  name: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  baseUnitId: z.string().trim().min(1),
  salePriceTnd: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/),
  isStockable: z.boolean(),
  notes: z.string().optional(),
});

const updateProductSchema = z.object({
  version: z.number().int().positive(),
  code: z.string().optional(),
  barcode: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  baseUnitId: z.string().trim().min(1).optional(),
  salePriceTnd: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/)
    .optional(),
  isStockable: z.boolean().optional(),
  notes: z.string().optional(),
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

  router.get(
    "/raw-materials",
    requirePermission("raw_materials.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const result = await params.catalogService.listRawMaterials(query);
        response.json(ok({ rawMaterials: result }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/raw-materials",
    requirePermission("raw_materials.create"),
    async (request, response, next) => {
      try {
        const body = createRawMaterialSchema.parse(request.body);
        const rawMaterial = await params.catalogService.createRawMaterial(
          body,
          actorFromResponse(response),
        );
        response
          .status(201)
          .json(ok({ rawMaterial }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/raw-materials/:rawMaterialId",
    requirePermission("raw_materials.update"),
    async (request, response, next) => {
      try {
        const body = updateRawMaterialSchema.parse(request.body);
        const rawMaterial = await params.catalogService.updateRawMaterial(
          parseRouteParam(request.params.rawMaterialId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ rawMaterial }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/raw-materials/:rawMaterialId/activation",
    requirePermission("raw_materials.activate"),
    async (request, response, next) => {
      try {
        const body = activationSchema.parse(request.body);
        const rawMaterial =
          await params.catalogService.setRawMaterialActivation(
            parseRouteParam(request.params.rawMaterialId),
            body,
            actorFromResponse(response),
          );
        response.json(ok({ rawMaterial }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/raw-materials/:rawMaterialId/conversions",
    requirePermission("raw_materials.update"),
    async (request, response, next) => {
      try {
        const body = replaceRawMaterialConversionsSchema.parse(request.body);
        const rawMaterial =
          await params.catalogService.replaceRawMaterialConversions(
            parseRouteParam(request.params.rawMaterialId),
            body,
            actorFromResponse(response),
          );
        response.json(ok({ rawMaterial }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/products",
    requirePermission("products.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const result = await params.catalogService.listProducts(query);
        response.json(ok({ products: result }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/products",
    requirePermission("products.create"),
    async (request, response, next) => {
      try {
        const body = createProductSchema.parse(request.body);
        const product = await params.catalogService.createProduct(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok({ product }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/products/:productId",
    requirePermission("products.update"),
    async (request, response, next) => {
      try {
        const body = updateProductSchema.parse(request.body);
        const product = await params.catalogService.updateProduct(
          parseRouteParam(request.params.productId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ product }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/products/:productId/activation",
    requirePermission("products.activate"),
    async (request, response, next) => {
      try {
        const body = activationSchema.parse(request.body);
        const product = await params.catalogService.setProductActivation(
          parseRouteParam(request.params.productId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ product }, getCorrelationId(response)));
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
