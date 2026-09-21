import { readApiError, type ApiEnvelope } from "../auth/authApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export interface Page<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

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
  category: Category;
  baseUnit: Unit;
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
  baseUnit: Unit;
  conversions: RawMaterialConversion[];
}

export interface RawMaterialConversion {
  id: string;
  rawMaterialId: string;
  unitId: string;
  factorToBase: string;
  isActive: boolean;
  unit: Unit;
}

export async function getCatalogWorkspace(): Promise<{
  units: Page<Unit>;
  categories: Page<Category>;
  products: Page<Product>;
  rawMaterials: Page<RawMaterial>;
}> {
  const [units, categories, products, rawMaterials] = await Promise.all([
    getUnits(),
    getCategories(),
    getProducts(),
    getRawMaterials(),
  ]);

  return { units, categories, products, rawMaterials };
}

export async function getUnits(): Promise<Page<Unit>> {
  return getPage("/catalog/units", "units");
}

export async function getCategories(): Promise<Page<Category>> {
  return getPage("/catalog/categories", "categories");
}

export async function getProducts(): Promise<Page<Product>> {
  return getPage("/catalog/products", "products");
}

export async function getRawMaterials(): Promise<Page<RawMaterial>> {
  return getPage("/catalog/raw-materials", "rawMaterials");
}

export async function createCategory(params: {
  name: string;
  description: string;
}): Promise<Category> {
  return mutate("/catalog/categories", "POST", params, "category");
}

export async function updateCategory(
  categoryId: string,
  params: { isActive: boolean },
): Promise<Category> {
  return mutate(
    `/catalog/categories/${categoryId}`,
    "PATCH",
    params,
    "category",
  );
}

export async function createUnit(params: {
  code: string;
  name: string;
  symbol: string;
  precision: number;
}): Promise<Unit> {
  return mutate("/catalog/units", "POST", params, "unit");
}

export async function updateUnit(
  unitId: string,
  params: { isActive: boolean },
): Promise<Unit> {
  return mutate(`/catalog/units/${unitId}`, "PATCH", params, "unit");
}

export async function createRawMaterial(params: {
  name: string;
  code: string;
  category: string;
  baseUnitId: string;
  notes: string;
}): Promise<RawMaterial> {
  return mutate("/catalog/raw-materials", "POST", params, "rawMaterial");
}

export async function setRawMaterialActivation(
  rawMaterial: RawMaterial,
): Promise<RawMaterial> {
  return mutate(
    `/catalog/raw-materials/${rawMaterial.id}/activation`,
    "PATCH",
    {
      version: rawMaterial.version,
      isActive: !rawMaterial.isActive,
    },
    "rawMaterial",
  );
}

export async function createProduct(params: {
  name: string;
  code: string;
  barcode: string;
  categoryId: string;
  baseUnitId: string;
  salePriceTnd: string;
  isStockable: boolean;
  notes: string;
}): Promise<Product> {
  return mutate("/catalog/products", "POST", params, "product");
}

export async function setProductActivation(product: Product): Promise<Product> {
  return mutate(
    `/catalog/products/${product.id}/activation`,
    "PATCH",
    {
      version: product.version,
      isActive: !product.isActive,
    },
    "product",
  );
}

async function getPage<TItem>(path: string, key: string): Promise<Page<TItem>> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<
    Record<string, Page<TItem>>
  >;
  return body.data[key];
}

async function mutate<TResult>(
  path: string,
  method: "POST" | "PATCH",
  payload: unknown,
  key: string,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}
