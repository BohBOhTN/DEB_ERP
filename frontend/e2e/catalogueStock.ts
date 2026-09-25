import type { Page, Route } from "@playwright/test";

/// Browser-side catalogue and stock mock for the Sprint 20 flows: an
/// in-memory store with the optimistic version and balances derived from
/// movements, like the real API.
interface Unit {
  id: string;
  code: string;
  name: string;
  symbol: string;
  precision: number;
  isActive: boolean;
}

interface Product {
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
  category: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  };
  baseUnit: Unit;
}

interface Movement {
  id: string;
  itemType: "PRODUCT" | "RAW_MATERIAL";
  productId: string | null;
  rawMaterialId: string | null;
  movementType: string;
  quantityDelta: string;
  itemNameSnapshot: string;
  unitNameSnapshot: string;
  sourceType: string;
  sourceId: string | null;
  sourceReference: string | null;
  reason: string | null;
  occurredAt: string;
  createdBy: { id: string; displayName: string } | null;
}

export interface CatalogueStockState {
  products: Product[];
  movements: Movement[];
}

const piece: Unit = {
  id: "unit-piece",
  code: "PC",
  name: "Pièce",
  symbol: "pièce",
  precision: 0,
  isActive: true,
};
const kg: Unit = {
  id: "unit-kg",
  code: "KG",
  name: "Kilogramme",
  symbol: "kg",
  precision: 3,
  isActive: true,
};
const bread = {
  id: "category-bread",
  name: "Pains",
  description: null,
  isActive: true,
};

export function makeCatalogueStockState(): CatalogueStockState {
  return { products: [], movements: [] };
}

const envelope = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ data, meta: { correlationId: "e2e" } }),
});
const failure = (status: number, code: string, message: string) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ error: { code, message, correlationId: "e2e" } }),
});
const page = (items: unknown[]) =>
  envelope({ items, page: 1, pageSize: 25, total: items.length, pageCount: 1 });

function balances(state: CatalogueStockState) {
  return state.products
    .filter((product) => product.isStockable)
    .map((product) => {
      const rows = state.movements.filter(
        (movement) => movement.productId === product.id,
      );
      const quantity = rows.reduce(
        (sum, row) => sum + Number(row.quantityDelta),
        0,
      );
      return {
        itemType: "PRODUCT",
        itemId: product.id,
        itemName: product.name,
        unitName: product.baseUnit.name,
        unitSymbol: product.baseUnit.symbol,
        quantity: String(quantity),
        isNegative: quantity < 0,
        lastMovementAt: rows[0]?.occurredAt ?? null,
      };
    });
}

let sequence = 0;

/// Handles the catalogue and stock routes; returns false for anything else so
/// the shell mock can answer.
export async function handleCatalogueStock(
  route: Route,
  state: CatalogueStockState,
): Promise<boolean> {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const method = route.request().method();
  const body = () => route.request().postDataJSON() as Record<string, unknown>;

  if (path === "/catalog/categories")
    return (route.fulfill(page([bread])), true);
  if (path === "/catalog/units")
    return (route.fulfill(page([piece, kg])), true);
  if (path === "/catalog/raw-materials") return (route.fulfill(page([])), true);

  if (path === "/catalog/products" && method === "GET") {
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    return (
      route.fulfill(
        page(
          state.products.filter((product) =>
            product.name.toLowerCase().includes(q),
          ),
        ),
      ),
      true
    );
  }

  if (path === "/catalog/products" && method === "POST") {
    const input = body();
    sequence += 1;
    const product: Product = {
      id: `product-${sequence}`,
      code: (input.code as string) ?? null,
      barcode: (input.barcode as string) ?? null,
      name: input.name as string,
      categoryId: input.categoryId as string,
      baseUnitId: input.baseUnitId as string,
      salePriceTnd: input.salePriceTnd as string,
      isStockable: Boolean(input.isStockable),
      isActive: true,
      notes: null,
      version: 1,
      createdAt: new Date().toISOString(),
      category: bread,
      baseUnit: input.baseUnitId === kg.id ? kg : piece,
    };
    state.products.push(product);
    return (route.fulfill(envelope({ product }, 201)), true);
  }

  const productMatch = /^\/catalog\/products\/([^/]+)$/.exec(path);
  if (productMatch) {
    const product = state.products.find((item) => item.id === productMatch[1]);
    if (!product)
      return (
        route.fulfill(
          failure(404, "PRODUCT_NOT_FOUND", "Produit introuvable."),
        ),
        true
      );
    if (method === "PATCH") {
      const input = body();
      if (input.version !== product.version)
        return (
          route.fulfill(
            failure(
              409,
              "VERSION_CONFLICT",
              "Cette fiche a été modifiée. Rechargez puis réessayez.",
            ),
          ),
          true
        );
      Object.assign(product, input, { version: product.version + 1 });
    }
    return (route.fulfill(envelope({ product })), true);
  }

  if (path === "/inventory/balances")
    return (route.fulfill(envelope({ balances: balances(state) })), true);

  if (path === "/inventory/movements") {
    const itemId = url.searchParams.get("itemId");
    return (
      route.fulfill(
        page(
          state.movements.filter(
            (movement) => !itemId || movement.productId === itemId,
          ),
        ),
      ),
      true
    );
  }

  if (
    (path === "/inventory/opening-stock" ||
      path === "/inventory/adjustments") &&
    method === "POST"
  ) {
    if (!route.request().headers()["idempotency-key"])
      return (
        route.fulfill(
          failure(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Une clé d'idempotence est requise.",
          ),
        ),
        true
      );
    const input = body();
    const product = state.products.find((item) => item.id === input.itemId);
    if (!product)
      return (
        route.fulfill(
          failure(404, "PRODUCT_NOT_FOUND", "Produit introuvable."),
        ),
        true
      );
    const quantityDelta = path.endsWith("opening-stock")
      ? (input.quantity as string)
      : (input.quantityDelta as string);
    sequence += 1;
    const movement: Movement = {
      id: `movement-${sequence}`,
      itemType: "PRODUCT",
      productId: product.id,
      rawMaterialId: null,
      movementType: path.endsWith("opening-stock")
        ? "OPENING_STOCK"
        : quantityDelta.startsWith("-")
          ? "STOCK_ADJUSTMENT_DECREASE"
          : "STOCK_ADJUSTMENT_INCREASE",
      quantityDelta,
      itemNameSnapshot: product.name,
      unitNameSnapshot: product.baseUnit.name,
      sourceType: path.endsWith("opening-stock")
        ? "OPENING_STOCK"
        : "STOCK_ADJUSTMENT",
      sourceId: null,
      sourceReference: null,
      reason: input.reason as string,
      occurredAt: new Date().toISOString(),
      createdBy: { id: "user-1", displayName: "Salma Ben Ali" },
    };
    state.movements.unshift(movement);
    return (route.fulfill(envelope({ movement }, 201)), true);
  }

  if (path === "/audit-events") return (route.fulfill(page([])), true);

  return false;
}

export async function mockCatalogueStock(
  page: Page,
  state: CatalogueStockState,
): Promise<void> {
  await page.route("**/api/v1/catalog/**", (route) =>
    handleCatalogueStock(route, state),
  );
  await page.route("**/api/v1/inventory/**", (route) =>
    handleCatalogueStock(route, state),
  );
  await page.route("**/api/v1/audit-events**", (route) =>
    handleCatalogueStock(route, state),
  );
}
