import type {
  Category,
  Product,
  RawMaterial,
  Unit,
} from "../../features/catalog/catalog.api.js";

let sequence = 0;
const next = () => (sequence += 1);

export const kg: Unit = {
  id: "unit-kg",
  code: "KG",
  name: "Kilogramme",
  symbol: "kg",
  precision: 3,
  isActive: true,
};
export const piece: Unit = {
  id: "unit-piece",
  code: "PC",
  name: "Pièce",
  symbol: "pièce",
  precision: 0,
  isActive: true,
};
export const sac: Unit = {
  id: "unit-sac",
  code: "SAC",
  name: "Sac de 50 kg",
  symbol: "sac",
  precision: 0,
  isActive: true,
};
export const breadCategory: Category = {
  id: "category-bread",
  name: "Pains",
  description: null,
  isActive: true,
};
export const pastryCategory: Category = {
  id: "category-pastry",
  name: "Pâtisserie",
  description: "Gâteaux et tartes",
  isActive: true,
};

export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  const n = next();
  return {
    id: `unit-${n}`,
    code: `U${n}`,
    name: `Unité ${n}`,
    symbol: `u${n}`,
    precision: 3,
    isActive: true,
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  const n = next();
  return {
    id: `category-${n}`,
    name: `Catégorie ${n}`,
    description: null,
    isActive: true,
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<Product> = {}): Product {
  const n = next();
  return {
    id: `product-${n}`,
    code: null,
    barcode: null,
    name: `Pain complet ${n}`,
    categoryId: breadCategory.id,
    baseUnitId: piece.id,
    salePriceTnd: "1.200",
    isStockable: true,
    isActive: true,
    notes: null,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    category: breadCategory,
    baseUnit: piece,
    ...overrides,
  };
}

export function makeRawMaterial(
  overrides: Partial<RawMaterial> = {},
): RawMaterial {
  const n = next();
  const id = overrides.id ?? `raw-${n}`;
  return {
    id,
    code: null,
    name: `Farine T55 ${n}`,
    category: "Farines",
    baseUnitId: kg.id,
    isActive: true,
    notes: null,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    baseUnit: kg,
    conversions: [
      {
        id: `conv-${n}`,
        rawMaterialId: id,
        unitId: sac.id,
        factorToBase: "50.000000",
        isActive: true,
        unit: sac,
      },
    ],
    ...overrides,
  };
}
