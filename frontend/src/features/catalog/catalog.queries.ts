import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import {
  invalidateAfter,
  primeDetail,
  useInvalidateAfter,
} from "../../lib/query/invalidation.js";
import * as api from "./catalog.api.js";
import type { CatalogListQuery } from "./catalog.api.js";

/// Query keys: `[module, entity, filters]` (06 section 2). Units and
/// categories sit under `reference` so the invalidation map can refresh
/// them apart from the paginated lists; related documents of a record
/// (its audit trail, its purchases) sit under `related`.
export const catalogKeys = {
  all: ["catalog"] as const,
  products: (query: CatalogListQuery) =>
    ["catalog", "products", query] as const,
  product: (id: string) => ["catalog", "product", id] as const,
  rawMaterials: (query: CatalogListQuery) =>
    ["catalog", "rawMaterials", query] as const,
  rawMaterial: (id: string) => ["catalog", "rawMaterial", id] as const,
  categories: (query: CatalogListQuery) =>
    ["catalog", "reference", "categories", query] as const,
  units: (query: CatalogListQuery) =>
    ["catalog", "reference", "units", query] as const,
  relatedAudit: (entity: string, targetId: string) =>
    ["catalog", "related", "audit", entity, targetId] as const,
  relatedPurchases: (rawMaterialId: string, page: number) =>
    ["catalog", "related", "purchases", rawMaterialId, page] as const,
};

/// Every active category or unit, for selects: one page of 100 is more than
/// a bakery ever has.
export const allActive: CatalogListQuery = {
  page: 1,
  pageSize: 100,
  isActive: true,
  sort: { field: "name", direction: "asc" },
};

export function useProducts(query: CatalogListQuery) {
  return useQuery({
    queryKey: catalogKeys.products(query),
    queryFn: () => api.listProducts(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: catalogKeys.product(productId),
    queryFn: () => api.getProduct(productId),
    ...tier("document"),
  });
}

export function useRawMaterials(query: CatalogListQuery) {
  return useQuery({
    queryKey: catalogKeys.rawMaterials(query),
    queryFn: () => api.listRawMaterials(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useRawMaterial(rawMaterialId: string) {
  return useQuery({
    queryKey: catalogKeys.rawMaterial(rawMaterialId),
    queryFn: () => api.getRawMaterial(rawMaterialId),
    ...tier("document"),
  });
}

export function useCategories(query: CatalogListQuery = allActive) {
  return useQuery({
    queryKey: catalogKeys.categories(query),
    queryFn: () => api.listCategories(query),
    placeholderData: (previous) => previous,
    ...tier("reference"),
  });
}

export function useUnits(query: CatalogListQuery = allActive) {
  return useQuery({
    queryKey: catalogKeys.units(query),
    queryFn: () => api.listUnits(query),
    placeholderData: (previous) => previous,
    ...tier("reference"),
  });
}

/// Warms the reference caches once per session so every combobox opens
/// with its options (UI-26); called by the shell, loaded on demand.
export async function prefetchCatalogReference(
  queryClient: Parameters<typeof invalidateAfter>[0],
  which: { units: boolean; categories: boolean } = {
    units: true,
    categories: true,
  },
): Promise<void> {
  await Promise.all([
    which.units
      ? queryClient.prefetchQuery({
          queryKey: catalogKeys.units(allActive),
          queryFn: () => api.listUnits(allActive),
          ...tier("reference"),
        })
      : null,
    which.categories
      ? queryClient.prefetchQuery({
          queryKey: catalogKeys.categories(allActive),
          queryFn: () => api.listCategories(allActive),
          ...tier("reference"),
        })
      : null,
  ]);
}

export function useCreateProduct() {
  const invalidate = useInvalidateAfter("catalog.product");
  return useMutation({ mutationFn: api.createProduct, onSuccess: invalidate });
}

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAfter("catalog.product");
  return useMutation({
    mutationFn: (input: Parameters<typeof api.updateProduct>[1]) =>
      api.updateProduct(productId, input),
    onSuccess: (product) => {
      primeDetail(queryClient, catalogKeys.product(productId), product);
      return invalidate();
    },
  });
}

export function useSetProductActivation() {
  const invalidate = useInvalidateAfter("catalog.product");
  return useMutation({
    mutationFn: (input: {
      productId: string;
      version: number;
      isActive: boolean;
    }) =>
      api.setProductActivation(input.productId, {
        version: input.version,
        isActive: input.isActive,
      }),
    onSuccess: invalidate,
  });
}

export function useCreateRawMaterial() {
  const invalidate = useInvalidateAfter("catalog.rawMaterial");
  return useMutation({
    mutationFn: api.createRawMaterial,
    onSuccess: invalidate,
  });
}

export function useUpdateRawMaterial(rawMaterialId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAfter("catalog.rawMaterial");
  return useMutation({
    mutationFn: async (
      input: Parameters<typeof api.updateRawMaterial>[1] & {
        conversions?: api.ConversionInput[];
      },
    ) => {
      const { conversions, ...fields } = input;
      const updated = await api.updateRawMaterial(rawMaterialId, fields);

      return conversions
        ? api.replaceRawMaterialConversions(rawMaterialId, {
            version: updated.version,
            conversions,
          })
        : updated;
    },
    onSuccess: (rawMaterial) => {
      primeDetail(
        queryClient,
        catalogKeys.rawMaterial(rawMaterialId),
        rawMaterial,
      );
      return invalidate();
    },
  });
}

export function useSetRawMaterialActivation() {
  const invalidate = useInvalidateAfter("catalog.rawMaterial");
  return useMutation({
    mutationFn: (input: {
      rawMaterialId: string;
      version: number;
      isActive: boolean;
    }) =>
      api.setRawMaterialActivation(input.rawMaterialId, {
        version: input.version,
        isActive: input.isActive,
      }),
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const invalidate = useInvalidateAfter("catalog.reference");
  return useMutation({ mutationFn: api.createCategory, onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateAfter("catalog.reference");
  return useMutation({
    mutationFn: (
      input: { categoryId: string } & Parameters<typeof api.updateCategory>[1],
    ) => {
      const { categoryId, ...fields } = input;
      return api.updateCategory(categoryId, fields);
    },
    onSuccess: invalidate,
  });
}

export function useCreateUnit() {
  const invalidate = useInvalidateAfter("catalog.reference");
  return useMutation({ mutationFn: api.createUnit, onSuccess: invalidate });
}

export function useUpdateUnit() {
  const invalidate = useInvalidateAfter("catalog.reference");
  return useMutation({
    mutationFn: (
      input: { unitId: string } & Parameters<typeof api.updateUnit>[1],
    ) => {
      const { unitId, ...fields } = input;
      return api.updateUnit(unitId, fields);
    },
    onSuccess: invalidate,
  });
}
