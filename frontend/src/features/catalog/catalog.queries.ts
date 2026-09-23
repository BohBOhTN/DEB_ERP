import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./catalog.api.js";
import type { CatalogListQuery } from "./catalog.api.js";

/// Query keys: `[module, entity, filters]` (06 section 2). Every mutation
/// invalidates the module root, and stock when an item changes name or unit.
export const catalogKeys = {
  all: ["catalog"] as const,
  products: (query: CatalogListQuery) =>
    ["catalog", "products", query] as const,
  product: (id: string) => ["catalog", "product", id] as const,
  rawMaterials: (query: CatalogListQuery) =>
    ["catalog", "rawMaterials", query] as const,
  rawMaterial: (id: string) => ["catalog", "rawMaterial", id] as const,
  categories: (query: CatalogListQuery) =>
    ["catalog", "categories", query] as const,
  units: (query: CatalogListQuery) => ["catalog", "units", query] as const,
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
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: catalogKeys.product(productId),
    queryFn: () => api.getProduct(productId),
  });
}

export function useRawMaterials(query: CatalogListQuery) {
  return useQuery({
    queryKey: catalogKeys.rawMaterials(query),
    queryFn: () => api.listRawMaterials(query),
    placeholderData: (previous) => previous,
  });
}

export function useRawMaterial(rawMaterialId: string) {
  return useQuery({
    queryKey: catalogKeys.rawMaterial(rawMaterialId),
    queryFn: () => api.getRawMaterial(rawMaterialId),
  });
}

export function useCategories(query: CatalogListQuery = allActive) {
  return useQuery({
    queryKey: catalogKeys.categories(query),
    queryFn: () => api.listCategories(query),
    placeholderData: (previous) => previous,
  });
}

export function useUnits(query: CatalogListQuery = allActive) {
  return useQuery({
    queryKey: catalogKeys.units(query),
    queryFn: () => api.listUnits(query),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateCatalog() {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    await queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: api.createProduct, onSuccess: invalidate });
}

export function useUpdateProduct(productId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.updateProduct>[1]) =>
      api.updateProduct(productId, input),
    onSuccess: invalidate,
  });
}

export function useSetProductActivation() {
  const invalidate = useInvalidateCatalog();
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
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: api.createRawMaterial,
    onSuccess: invalidate,
  });
}

export function useUpdateRawMaterial(rawMaterialId: string) {
  const invalidate = useInvalidateCatalog();
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
    onSuccess: invalidate,
  });
}

export function useSetRawMaterialActivation() {
  const invalidate = useInvalidateCatalog();
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
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: api.createCategory, onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCatalog();
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
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: api.createUnit, onSuccess: invalidate });
}

export function useUpdateUnit() {
  const invalidate = useInvalidateCatalog();
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
