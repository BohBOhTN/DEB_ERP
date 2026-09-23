import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1/catalog` (UI-10). Payload shapes follow the backend Prisma
/// includes: a product carries its category and base unit, a raw material
/// its base unit and conversions.
export interface Unit {
  id: string;
  code: string;
  name: string;
  symbol: string;
  precision: number;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  categoryId: string;
  baseUnitId: string;
  salePriceTnd: string;
  isStockable: boolean;
  isActive: boolean;
  notes: string | null;
  version: number;
  createdAt: string;
  category: Category;
  baseUnit: Unit;
}

export interface RawMaterialConversion {
  id: string;
  rawMaterialId: string;
  unitId: string;
  factorToBase: string;
  isActive: boolean;
  unit: Unit;
}

export interface RawMaterial {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  baseUnitId: string;
  isActive: boolean;
  notes: string | null;
  version: number;
  createdAt: string;
  baseUnit: Unit;
  conversions: RawMaterialConversion[];
}

export interface CatalogListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: SortSpec;
  isActive?: boolean;
}

const listQuery = (query: CatalogListQuery) => ({
  query: toSearchParams({ ...query }),
});

export function listProducts(
  query: CatalogListQuery,
): Promise<PageResult<Product>> {
  return apiClient.list<Product>("/catalog/products", listQuery(query));
}

export async function getProduct(productId: string): Promise<Product> {
  return (
    await apiClient.get<{ product: Product }>(`/catalog/products/${productId}`)
  ).product;
}

export interface ProductInput {
  name: string;
  categoryId: string;
  baseUnitId: string;
  salePriceTnd: string;
  isStockable: boolean;
  code?: string;
  barcode?: string;
  notes?: string;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return (
    await apiClient.post<{ product: Product }>("/catalog/products", input)
  ).product;
}

export async function updateProduct(
  productId: string,
  input: Partial<ProductInput> & { version: number },
): Promise<Product> {
  return (
    await apiClient.patch<{ product: Product }>(
      `/catalog/products/${productId}`,
      input,
    )
  ).product;
}

export async function setProductActivation(
  productId: string,
  input: { version: number; isActive: boolean },
): Promise<Product> {
  return (
    await apiClient.patch<{ product: Product }>(
      `/catalog/products/${productId}/activation`,
      input,
    )
  ).product;
}

export function listRawMaterials(
  query: CatalogListQuery,
): Promise<PageResult<RawMaterial>> {
  return apiClient.list<RawMaterial>(
    "/catalog/raw-materials",
    listQuery(query),
  );
}

export async function getRawMaterial(
  rawMaterialId: string,
): Promise<RawMaterial> {
  return (
    await apiClient.get<{ rawMaterial: RawMaterial }>(
      `/catalog/raw-materials/${rawMaterialId}`,
    )
  ).rawMaterial;
}

export interface ConversionInput {
  unitId: string;
  factorToBase: string;
}

export interface RawMaterialInput {
  name: string;
  baseUnitId: string;
  code?: string;
  category?: string;
  notes?: string;
  conversions?: ConversionInput[];
}

export async function createRawMaterial(
  input: RawMaterialInput,
): Promise<RawMaterial> {
  return (
    await apiClient.post<{ rawMaterial: RawMaterial }>(
      "/catalog/raw-materials",
      input,
    )
  ).rawMaterial;
}

export async function updateRawMaterial(
  rawMaterialId: string,
  input: Partial<Omit<RawMaterialInput, "conversions">> & { version: number },
): Promise<RawMaterial> {
  return (
    await apiClient.patch<{ rawMaterial: RawMaterial }>(
      `/catalog/raw-materials/${rawMaterialId}`,
      input,
    )
  ).rawMaterial;
}

export async function replaceRawMaterialConversions(
  rawMaterialId: string,
  input: { version: number; conversions: ConversionInput[] },
): Promise<RawMaterial> {
  return (
    await apiClient.put<{ rawMaterial: RawMaterial }>(
      `/catalog/raw-materials/${rawMaterialId}/conversions`,
      input,
    )
  ).rawMaterial;
}

export async function setRawMaterialActivation(
  rawMaterialId: string,
  input: { version: number; isActive: boolean },
): Promise<RawMaterial> {
  return (
    await apiClient.patch<{ rawMaterial: RawMaterial }>(
      `/catalog/raw-materials/${rawMaterialId}/activation`,
      input,
    )
  ).rawMaterial;
}

export function listCategories(
  query: CatalogListQuery,
): Promise<PageResult<Category>> {
  return apiClient.list<Category>("/catalog/categories", listQuery(query));
}

export async function createCategory(input: {
  name: string;
  description?: string;
}): Promise<Category> {
  return (
    await apiClient.post<{ category: Category }>("/catalog/categories", input)
  ).category;
}

export async function updateCategory(
  categoryId: string,
  input: { name?: string; description?: string; isActive?: boolean },
): Promise<Category> {
  return (
    await apiClient.patch<{ category: Category }>(
      `/catalog/categories/${categoryId}`,
      input,
    )
  ).category;
}

export function listUnits(query: CatalogListQuery): Promise<PageResult<Unit>> {
  return apiClient.list<Unit>("/catalog/units", listQuery(query));
}

export async function createUnit(input: {
  code: string;
  name: string;
  symbol: string;
  precision: number;
}): Promise<Unit> {
  return (await apiClient.post<{ unit: Unit }>("/catalog/units", input)).unit;
}

export async function updateUnit(
  unitId: string,
  input: {
    name?: string;
    symbol?: string;
    precision?: number;
    isActive?: boolean;
  },
): Promise<Unit> {
  return (
    await apiClient.patch<{ unit: Unit }>(`/catalog/units/${unitId}`, input)
  ).unit;
}
