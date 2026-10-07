import { http } from "msw";
import type {
  Category,
  Product,
  PurchasePricePoint,
  RawMaterial,
  Unit,
} from "../../../features/catalog/catalog.api.js";
import {
  breadCategory,
  kg,
  makeProduct,
  makeRawMaterial,
  pastryCategory,
  piece,
  sac,
} from "../../factories/catalog.js";
import { makePage } from "../../factories/page.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// An in-memory catalogue: lists honour `q`, `isActive`, `page`, `pageSize`;
/// writes validate like the API and enforce the optimistic version.
export interface CatalogStore {
  products: Product[];
  rawMaterials: RawMaterial[];
  categories: Category[];
  units: Unit[];
  /// Issue 023: the prices paid per item id, oldest first, and the sale
  /// prices a product had; an item absent here has none.
  purchasePrices?: Record<string, PurchasePricePoint[]>;
  salePrices?: Record<
    string,
    Array<{ id: string; salePriceTnd: string; effectiveAt: string }>
  >;
}

/// Issue 023: three purchases of water and two of flour, each dearer than
/// the last, for the price tabs.
export function makePurchasePrices(): Record<string, PurchasePricePoint[]> {
  const point = (
    lineId: string,
    purchasedAt: string,
    unitPriceTnd: string,
    quantity: string,
    unitName: string,
    reference: string,
  ): PurchasePricePoint => ({
    lineId,
    purchaseId: `purchase-${lineId}`,
    reference,
    purchasedAt,
    supplier: { id: "supplier-1", name: "Minoterie du Sud" },
    unitPriceTnd,
    quantity,
    unitName,
  });
  return {
    "product-water": [
      point(
        "w1",
        "2026-09-01T00:00:00.000Z",
        "0.800",
        "24.000000",
        "Pièce",
        "AC-000010",
      ),
      point(
        "w2",
        "2026-09-15T00:00:00.000Z",
        "0.820",
        "48.000000",
        "Pièce",
        "AC-000012",
      ),
      point(
        "w3",
        "2026-10-01T00:00:00.000Z",
        "0.850",
        "24.000000",
        "Pièce",
        "AC-000015",
      ),
    ],
    "raw-1": [
      point(
        "f1",
        "2026-09-03T00:00:00.000Z",
        "1.200",
        "100.000000",
        "Kilogramme",
        "AC-000011",
      ),
      point(
        "f2",
        "2026-09-28T00:00:00.000Z",
        "1.320",
        "200.000000",
        "Kilogramme",
        "AC-000014",
      ),
    ],
  };
}

export function makeCatalogStore(
  overrides: Partial<CatalogStore> = {},
): CatalogStore {
  return {
    products: [
      makeProduct({ id: "product-1", name: "Pain complet" }),
      makeProduct({
        id: "product-2",
        name: "Croissant",
        categoryId: pastryCategory.id,
        category: pastryCategory,
        salePriceTnd: "1.000",
      }),
    ],
    rawMaterials: [makeRawMaterial({ id: "raw-1", name: "Farine T55" })],
    categories: [breadCategory, pastryCategory],
    units: [piece, kg, sac],
    ...overrides,
  };
}

let sequence = 100;

function page<T extends { name: string; isActive: boolean }>(
  rows: T[],
  request: Request,
) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.toLowerCase() ?? "";
  const isActive = url.searchParams.get("isActive");
  const isResale = url.searchParams.get("isResale");
  const pageNumber = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const matching = rows.filter(
    (row) =>
      row.name.toLowerCase().includes(q) &&
      (isActive === null || String(row.isActive) === isActive) &&
      // Issue 019: the purchase picker asks for the resold products only.
      (isResale === null ||
        String((row as { isResale?: boolean }).isResale ?? false) === isResale),
  );
  const start = (pageNumber - 1) * pageSize;

  return ok(
    makePage(matching.slice(start, start + pageSize), {
      page: pageNumber,
      pageSize,
      total: matching.length,
    }),
  );
}

export function catalogHandlers(store: CatalogStore = makeCatalogStore()) {
  return [
    http.get(`${apiV1}/catalog/products`, ({ request }) =>
      page(store.products, request),
    ),
    // Issue 023: the prices of an item over time.
    http.get(
      `${apiV1}/catalog/products/:productId/price-history`,
      ({ params }) => {
        const product = store.products.find(
          (item) => item.id === params.productId,
        );
        if (!product)
          return apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
        return ok({
          priceHistory: {
            productId: product.id,
            currentSalePriceTnd: product.salePriceTnd,
            salePrices: store.salePrices?.[product.id] ?? [
              {
                id: `sale-${product.id}`,
                salePriceTnd: product.salePriceTnd,
                effectiveAt: product.createdAt,
              },
            ],
            purchasePrices: store.purchasePrices?.[product.id] ?? [],
          },
        });
      },
    ),
    http.get(
      `${apiV1}/catalog/raw-materials/:id/price-history`,
      ({ params }) => {
        const rawMaterial = store.rawMaterials.find(
          (item) => item.id === params.id,
        );
        if (!rawMaterial)
          return apiError(
            404,
            "RAW_MATERIAL_NOT_FOUND",
            "Matière première introuvable.",
          );
        return ok({
          priceHistory: {
            rawMaterialId: rawMaterial.id,
            purchasePrices: store.purchasePrices?.[rawMaterial.id] ?? [],
          },
        });
      },
    ),
    http.get(`${apiV1}/catalog/products/:productId`, ({ params }) => {
      const product = store.products.find(
        (item) => item.id === params.productId,
      );
      return product
        ? ok({ product })
        : apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
    }),
    http.post(`${apiV1}/catalog/products`, async ({ request }) => {
      const body = (await request.json()) as Partial<Product>;
      if (!body.name) {
        return apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          { name: "Ce champ est obligatoire." },
        );
      }
      if (
        store.products.some((item) => item.isActive && item.name === body.name)
      ) {
        return apiError(
          409,
          "ACTIVE_PRODUCT_NAME_NOT_UNIQUE",
          "Un produit actif porte déjà ce nom.",
        );
      }
      sequence += 1;
      const category =
        store.categories.find((item) => item.id === body.categoryId) ??
        breadCategory;
      const baseUnit =
        store.units.find((item) => item.id === body.baseUnitId) ?? piece;
      const product = makeProduct({
        ...body,
        id: `product-${sequence}`,
        category,
        baseUnit,
        // Issue 019: a resold product is stock-tracked whatever was sent.
        isStockable: body.isResale ? true : (body.isStockable ?? true),
        version: 1,
      });
      store.products.push(product);
      return ok({ product }, 201);
    }),
    http.patch(
      `${apiV1}/catalog/products/:productId`,
      async ({ params, request }) => {
        const body = (await request.json()) as Partial<Product> & {
          version: number;
        };
        const product = store.products.find(
          (item) => item.id === params.productId,
        );
        if (!product)
          return apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
        if (body.version !== product.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        Object.assign(product, body, { version: product.version + 1 });
        return ok({ product });
      },
    ),
    // Issue #64: the photo routes. The stored path names the product so a
    // test can tell whose photo is shown.
    http.put(
      `${apiV1}/catalog/products/:productId/image`,
      async ({ params, request }) => {
        const product = store.products.find(
          (item) => item.id === params.productId,
        );
        if (!product)
          return apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
        // A browser sends multipart; jsdom's FormData is not the one Node's
        // fetch serialises, so the tests reach here with a plain body. Either
        // way an empty upload is refused; the real parsing is covered by the
        // API's route tests.
        const type = request.headers.get("content-type") ?? "";
        const empty = type.includes("multipart/form-data")
          ? !(await request.formData()).get("file")
          : (await request.text()).length === 0;
        if (empty)
          return apiError(
            400,
            "PRODUCT_IMAGE_REQUIRED",
            "Choisissez une photo.",
          );
        Object.assign(product, {
          imageUrl: `/media/products/${product.id}.webp`,
          version: product.version + 1,
        });
        return ok({ product });
      },
    ),
    http.delete(`${apiV1}/catalog/products/:productId/image`, ({ params }) => {
      const product = store.products.find(
        (item) => item.id === params.productId,
      );
      if (!product)
        return apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
      Object.assign(product, { imageUrl: null, version: product.version + 1 });
      return ok({ product });
    }),
    http.patch(
      `${apiV1}/catalog/products/:productId/activation`,
      async ({ params, request }) => {
        const body = (await request.json()) as {
          version: number;
          isActive: boolean;
        };
        const product = store.products.find(
          (item) => item.id === params.productId,
        );
        if (!product)
          return apiError(404, "PRODUCT_NOT_FOUND", "Produit introuvable.");
        if (body.version !== product.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        Object.assign(product, {
          isActive: body.isActive,
          version: product.version + 1,
        });
        return ok({ product });
      },
    ),
    http.get(`${apiV1}/catalog/raw-materials`, ({ request }) =>
      page(store.rawMaterials, request),
    ),
    http.get(`${apiV1}/catalog/raw-materials/:id`, ({ params }) => {
      const rawMaterial = store.rawMaterials.find(
        (item) => item.id === params.id,
      );
      return rawMaterial
        ? ok({ rawMaterial })
        : apiError(
            404,
            "RAW_MATERIAL_NOT_FOUND",
            "Matière première introuvable.",
          );
    }),
    http.post(`${apiV1}/catalog/raw-materials`, async ({ request }) => {
      const body = (await request.json()) as Partial<RawMaterial> & {
        conversions?: Array<{ unitId: string; factorToBase: string }>;
      };
      sequence += 1;
      const id = `raw-${sequence}`;
      const rawMaterial = makeRawMaterial({
        ...body,
        id,
        baseUnit: store.units.find((item) => item.id === body.baseUnitId) ?? kg,
        conversions: (body.conversions ?? []).map((conversion, index) => ({
          id: `conv-${sequence}-${index}`,
          rawMaterialId: id,
          unitId: conversion.unitId,
          factorToBase: conversion.factorToBase,
          isActive: true,
          unit:
            store.units.find((item) => item.id === conversion.unitId) ?? sac,
        })),
      });
      store.rawMaterials.push(rawMaterial);
      return ok({ rawMaterial }, 201);
    }),
    http.patch(
      `${apiV1}/catalog/raw-materials/:id`,
      async ({ params, request }) => {
        const body = (await request.json()) as Partial<RawMaterial> & {
          version: number;
        };
        const rawMaterial = store.rawMaterials.find(
          (item) => item.id === params.id,
        );
        if (!rawMaterial)
          return apiError(
            404,
            "RAW_MATERIAL_NOT_FOUND",
            "Matière première introuvable.",
          );
        if (body.version !== rawMaterial.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        Object.assign(rawMaterial, body, { version: rawMaterial.version + 1 });
        return ok({ rawMaterial });
      },
    ),
    http.put(
      `${apiV1}/catalog/raw-materials/:id/conversions`,
      async ({ params, request }) => {
        const body = (await request.json()) as {
          version: number;
          conversions: Array<{ unitId: string; factorToBase: string }>;
        };
        const rawMaterial = store.rawMaterials.find(
          (item) => item.id === params.id,
        );
        if (!rawMaterial)
          return apiError(
            404,
            "RAW_MATERIAL_NOT_FOUND",
            "Matière première introuvable.",
          );
        if (body.version !== rawMaterial.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        rawMaterial.conversions = body.conversions.map((conversion, index) => ({
          id: `conv-${rawMaterial.id}-${index}`,
          rawMaterialId: rawMaterial.id,
          unitId: conversion.unitId,
          factorToBase: conversion.factorToBase,
          isActive: true,
          unit:
            store.units.find((item) => item.id === conversion.unitId) ?? sac,
        }));
        rawMaterial.version += 1;
        return ok({ rawMaterial });
      },
    ),
    http.patch(
      `${apiV1}/catalog/raw-materials/:id/activation`,
      async ({ params, request }) => {
        const body = (await request.json()) as {
          version: number;
          isActive: boolean;
        };
        const rawMaterial = store.rawMaterials.find(
          (item) => item.id === params.id,
        );
        if (!rawMaterial)
          return apiError(
            404,
            "RAW_MATERIAL_NOT_FOUND",
            "Matière première introuvable.",
          );
        if (body.version !== rawMaterial.version)
          return apiError(
            409,
            "VERSION_CONFLICT",
            "Cette fiche a été modifiée. Rechargez puis réessayez.",
          );
        Object.assign(rawMaterial, {
          isActive: body.isActive,
          version: rawMaterial.version + 1,
        });
        return ok({ rawMaterial });
      },
    ),
    http.get(`${apiV1}/catalog/categories`, ({ request }) =>
      page(store.categories, request),
    ),
    http.post(`${apiV1}/catalog/categories`, async ({ request }) => {
      const body = (await request.json()) as Partial<Category>;
      sequence += 1;
      const category: Category = {
        id: `category-${sequence}`,
        name: body.name ?? "",
        description: body.description ?? null,
        isActive: true,
      };
      store.categories.push(category);
      return ok({ category }, 201);
    }),
    http.patch(
      `${apiV1}/catalog/categories/:id`,
      async ({ params, request }) => {
        const body = (await request.json()) as Partial<Category>;
        const category = store.categories.find((item) => item.id === params.id);
        if (!category)
          return apiError(404, "CATEGORY_NOT_FOUND", "Catégorie introuvable.");
        Object.assign(category, body);
        return ok({ category });
      },
    ),
    http.get(`${apiV1}/catalog/units`, ({ request }) =>
      page(store.units, request),
    ),
    http.post(`${apiV1}/catalog/units`, async ({ request }) => {
      const body = (await request.json()) as Partial<Unit>;
      sequence += 1;
      const unit: Unit = {
        id: `unit-${sequence}`,
        code: body.code ?? "",
        name: body.name ?? "",
        symbol: body.symbol ?? "",
        precision: body.precision ?? 3,
        isActive: true,
      };
      store.units.push(unit);
      return ok({ unit }, 201);
    }),
    http.patch(`${apiV1}/catalog/units/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<Unit>;
      const unit = store.units.find((item) => item.id === params.id);
      if (!unit) return apiError(404, "UNIT_NOT_FOUND", "Unité introuvable.");
      Object.assign(unit, body);
      return ok({ unit });
    }),
  ];
}
