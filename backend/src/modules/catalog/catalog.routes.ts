import { Router, type RequestHandler, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { requirePermission } from "../access/permission.middleware.js";
import { okFor } from "../../shared/apiResponse.js";
import {
  pageFields,
  searchFields,
  sortField,
  withSearch,
} from "../../shared/listQuery.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import { mediaUrlOf } from "../../shared/media.js";
import type { CatalogService } from "./catalog.service.js";

/// Raw upload ceiling; the stored file is far smaller once re-encoded.
export const productImageMaxBytes = 5 * 1024 * 1024;

export const listQuerySchema = z.object({
  sort: sortField(["name", "createdAt"]),
  ...searchFields,
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  ...pageFields,
});

export const productListQuerySchema = listQuerySchema.extend({
  sort: sortField([
    "name",
    "createdAt",
    "salePriceTnd",
    "approximateCostTnd",
    "isActive",
  ]),
  categoryId: z.string().trim().min(1).optional(),
  isStockable: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const createUnitSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  precision: z.number().int().min(0).max(6).default(3),
});

export const updateUnitSchema = z.object({
  name: z.string().trim().min(1).optional(),
  symbol: z.string().trim().min(1).optional(),
  precision: z.number().int().min(0).max(6).optional(),
  isActive: z.boolean().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

export const createRawMaterialSchema = z.object({
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

export const updateRawMaterialSchema = z.object({
  version: z.number().int().positive(),
  code: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  baseUnitId: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
});

export const replaceRawMaterialConversionsSchema = z.object({
  version: z.number().int().positive(),
  conversions: z.array(
    z.object({
      unitId: z.string().trim().min(1),
      factorToBase: decimalString,
    }),
  ),
});

export const activationSchema = z.object({
  version: z.number().int().positive(),
  isActive: z.boolean(),
});

/// Issue 008: the approximate cost is optional and an empty string clears
/// it; `margin.view` is needed to read it back.
const approximateCostSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/)
  .or(z.literal(""))
  .nullable()
  .optional()
  .transform((value) => (value === "" ? null : value));

export const createProductSchema = z.object({
  code: z.string().optional(),
  barcode: z.string().optional(),
  name: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  baseUnitId: z.string().trim().min(1),
  salePriceTnd: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/),
  approximateCostTnd: approximateCostSchema,
  isStockable: z.boolean(),
  notes: z.string().optional(),
});

export const updateProductSchema = z.object({
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
  approximateCostTnd: approximateCostSchema,
  isStockable: z.boolean().optional(),
  notes: z.string().optional(),
});

/// The cost and the margin are the owner's figures: a caller without
/// `margin.view` (a cashier with `products.view`) reads the product without
/// them (issue 008).
function withoutCostUnlessAllowed<T extends { approximateCostTnd?: unknown }>(
  response: Response,
  product: T,
): T {
  const user = response.locals.currentUser as
    { effectivePermissions: string[] } | undefined;

  if (user?.effectivePermissions.includes("margin.view")) {
    return product;
  }

  const rest = { ...product };
  delete rest.approximateCostTnd;
  return rest;
}

/// What every product read returns: the cost when allowed, and the photo's
/// public path (issue #64).
function presentProduct<
  T extends { approximateCostTnd?: unknown; imageKey?: string | null },
>(response: Response, product: T) {
  return {
    ...withoutCostUnlessAllowed(response, product),
    imageUrl: mediaUrlOf(product.imageKey),
  };
}

/// One file in memory, then the service decides; a Multer refusal becomes
/// one of the API's own errors instead of a 500.
function productImageUpload(): RequestHandler {
  const single = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: productImageMaxBytes, files: 1 },
  }).single("file");

  return (request, response, next) => {
    single(request, response, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        next(
          new AppError({
            statusCode: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
            code:
              error.code === "LIMIT_FILE_SIZE"
                ? "PRODUCT_IMAGE_TOO_LARGE"
                : "PRODUCT_IMAGE_INVALID",
            message:
              error.code === "LIMIT_FILE_SIZE"
                ? "La photo dépasse 5 Mo."
                : "La photo n'a pas pu être lue ; essayez un autre fichier.",
          }),
        );
        return;
      }
      next(error);
    });
  };
}

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
        const query = withSearch(listQuerySchema.parse(request.query));
        const result = await params.catalogService.listUnits(query);
        response.json(okFor(response, { units: result }));
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
        response.status(201).json(okFor(response, { unit }));
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
        response.json(okFor(response, { unit }));
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
        const query = withSearch(listQuerySchema.parse(request.query));
        const result = await params.catalogService.listCategories(query);
        response.json(okFor(response, { categories: result }));
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
        response.status(201).json(okFor(response, { category }));
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
        response.json(okFor(response, { category }));
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
        const query = withSearch(listQuerySchema.parse(request.query));
        const result = await params.catalogService.listRawMaterials(query);
        response.json(okFor(response, { rawMaterials: result }));
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
        response.status(201).json(okFor(response, { rawMaterial }));
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
        response.json(okFor(response, { rawMaterial }));
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
        response.json(okFor(response, { rawMaterial }));
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
        response.json(okFor(response, { rawMaterial }));
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
        const query = withSearch(productListQuerySchema.parse(request.query));
        const result = await params.catalogService.listProducts(query);
        response.json(
          okFor(response, {
            products: {
              ...result,
              items: result.items.map((item) => presentProduct(response, item)),
            },
          }),
        );
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
        response.status(201).json(
          okFor(response, {
            product: presentProduct(response, product),
          }),
        );
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
        response.json(
          okFor(response, {
            product: presentProduct(response, product),
          }),
        );
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
        response.json(
          okFor(response, {
            product: presentProduct(response, product),
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/products/:productId/image",
    requirePermission("products.update"),
    productImageUpload(),
    async (request, response, next) => {
      try {
        const file = (request as { file?: { buffer: Buffer } }).file;
        if (!file) {
          throw new AppError({
            statusCode: 400,
            code: "PRODUCT_IMAGE_REQUIRED",
            message: "Choisissez une photo à enregistrer.",
          });
        }
        const product = await params.catalogService.setProductImage(
          parseRouteParam(request.params.productId),
          file.buffer,
          actorFromResponse(response),
        );
        response.json(
          okFor(response, { product: presentProduct(response, product) }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/products/:productId/image",
    requirePermission("products.update"),
    async (request, response, next) => {
      try {
        const product = await params.catalogService.removeProductImage(
          parseRouteParam(request.params.productId),
          actorFromResponse(response),
        );
        response.json(
          okFor(response, { product: presentProduct(response, product) }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/products/:productId",
    requirePermission("products.view"),
    async (request, response, next) => {
      try {
        const product = await params.catalogService.getProduct(
          parseRouteParam(request.params.productId),
        );
        response.json(
          okFor(response, {
            product: presentProduct(response, product),
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/raw-materials/:rawMaterialId",
    requirePermission("raw_materials.view"),
    async (request, response, next) => {
      try {
        const rawMaterial = await params.catalogService.getRawMaterial(
          parseRouteParam(request.params.rawMaterialId),
        );
        response.json(okFor(response, { rawMaterial }));
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
