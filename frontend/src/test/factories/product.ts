export interface ProductFixture {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unitId: string;
  unitSymbol: string;
  salePriceTnd: string;
  isStockable: boolean;
  isActive: boolean;
  version: number;
  createdAt: string;
}

let sequence = 0;

export function makeProduct(
  overrides: Partial<ProductFixture> = {},
): ProductFixture {
  sequence += 1;

  return {
    id: `product-${sequence}`,
    name: `Pain complet ${sequence}`,
    categoryId: "category-bread",
    categoryName: "Pains",
    unitId: "unit-piece",
    unitSymbol: "pièce",
    salePriceTnd: "1.200",
    isStockable: true,
    isActive: true,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}
