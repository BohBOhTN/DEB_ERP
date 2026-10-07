import Decimal from "decimal.js-light";
import { useCallback, useRef } from "react";
import {
  LineEditor,
  newLine,
  unitPriceForTotal,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import type { ComboboxOption } from "../../../components/ui/Combobox/Combobox.js";
import { formatQuantity } from "../../../i18n/format.js";
import { useCachedSearch } from "../../../lib/query/cachedOptions.js";
import { roots } from "../../../lib/query/invalidation.js";
import {
  listProducts,
  listRawMaterials,
  type Product,
  type RawMaterial,
} from "../../catalog/catalog.api.js";
import { purchaseLineTotal } from "../procurement.schemas.js";

/// What a purchase line buys (issue 019): a raw material, or a product
/// flagged for resale.
export type PurchaseLineKind = "RAW_MATERIAL" | "PRODUCT";
export const allPurchaseKinds: readonly PurchaseLineKind[] = [
  "RAW_MATERIAL",
  "PRODUCT",
];

async function fetchRawMaterials(query: string): Promise<RawMaterial[]> {
  const page = await listRawMaterials({
    page: 1,
    pageSize: 8,
    q: query || undefined,
    isActive: true,
    sort: { field: "name", direction: "asc" },
  });
  return page.items;
}

async function fetchResaleProducts(query: string): Promise<Product[]> {
  const page = await listProducts({
    page: 1,
    pageSize: 8,
    q: query || undefined,
    isActive: true,
    isResale: true,
    sort: { field: "name", direction: "asc" },
  } as Parameters<typeof listProducts>[0]);
  return page.items;
}

/// A purchase line keeps the record of what it buys with it, so the unit
/// options, the conversion factor and the base symbol never need a lookup.
export interface PurchaseEditorLine extends EditorLine {
  kind: PurchaseLineKind;
  rawMaterial: RawMaterial | null;
  product: Product | null;
  factorToBase: string;
}

interface PurchaseItemOption extends ComboboxOption {
  kind: PurchaseLineKind;
  rawMaterial?: RawMaterial;
  product?: Product;
}

export interface PurchaseLineEditorProps {
  lines: PurchaseEditorLine[];
  onChange: (lines: PurchaseEditorLine[]) => void;
  /// What the picker offers: both kinds on a purchase, one kind per card on
  /// a shopping trip. A caller without `products.view` passes the raw
  /// materials alone.
  kinds?: readonly PurchaseLineKind[];
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

export function newPurchaseLine(
  kind: PurchaseLineKind = "RAW_MATERIAL",
): PurchaseEditorLine {
  return {
    ...newLine(),
    kind,
    rawMaterial: null,
    product: null,
    factorToBase: "1",
  };
}

export function lineFromRawMaterial(
  rawMaterial: RawMaterial,
  fields: { unitId: string; quantity: string; unitPriceTnd: string },
): PurchaseEditorLine {
  return {
    ...newLine(),
    kind: "RAW_MATERIAL",
    item: { value: rawMaterial.id, label: rawMaterial.name },
    rawMaterial,
    product: null,
    quantity: fields.quantity,
    unitId: fields.unitId,
    unitPriceTnd: fields.unitPriceTnd,
    factorToBase: factorFor(rawMaterial, fields.unitId),
  };
}

/// A resold product is bought in its own unit: no conversion.
export function lineFromProduct(
  product: Product,
  fields: { quantity: string; unitPriceTnd: string },
): PurchaseEditorLine {
  return {
    ...newLine(),
    kind: "PRODUCT",
    item: { value: product.id, label: product.name },
    rawMaterial: null,
    product,
    quantity: fields.quantity,
    unitId: product.baseUnitId,
    unitPriceTnd: fields.unitPriceTnd,
    factorToBase: "1",
  };
}

export function factorFor(
  rawMaterial: RawMaterial,
  unitId: string | null | undefined,
): string {
  if (!unitId || unitId === rawMaterial.baseUnitId) {
    return "1";
  }

  return (
    rawMaterial.conversions.find(
      (conversion) => conversion.unitId === unitId && conversion.isActive,
    )?.factorToBase ?? "1"
  );
}

const labels: Record<string, string> = {
  RAW_MATERIAL: "Matière première",
  PRODUCT: "Produit de revente",
};

/// The lines of a purchase (07 section 4.3, issue 019): the picker searches
/// the raw materials and the products flagged for resale by name, says
/// which is which, and leaves out what another line already holds. A raw
/// material takes its unit from its active conversions and, for a unit
/// other than the base one, the hints state the base quantity ("= 50 kg")
/// and the unit of the price ("par kg"); a resold product has its one unit.
export function PurchaseLineEditor({
  lines,
  onChange,
  kinds = allPurchaseKinds,
  errors,
  disabled,
}: PurchaseLineEditorProps) {
  const rawMaterials = useRef(new Map<string, RawMaterial>());
  const products = useRef(new Map<string, Product>());
  // Issue 009: one read per query for the session, refreshed by a write on
  // the catalogue.
  const searchRawMaterials = useCachedSearch(
    roots.catalogRawMaterials,
    fetchRawMaterials,
  );
  const searchProducts = useCachedSearch(
    roots.catalogProducts,
    fetchResaleProducts,
    { prefetch: false },
  );
  const withRawMaterials = kinds.includes("RAW_MATERIAL");
  const withProducts = kinds.includes("PRODUCT");
  const mixed = withRawMaterials && withProducts;

  const loadItems = useCallback(
    async (query: string): Promise<PurchaseItemOption[]> => {
      const [materialRows, productRows] = await Promise.all([
        withRawMaterials ? searchRawMaterials(query) : [],
        withProducts ? searchProducts(query) : [],
      ]);

      return [
        ...materialRows.map((rawMaterial): PurchaseItemOption => {
          rawMaterials.current.set(rawMaterial.id, rawMaterial);
          const detail = `${rawMaterial.baseUnit.name}${rawMaterial.category ? ` · ${rawMaterial.category}` : ""}`;
          return {
            value: rawMaterial.id,
            label: rawMaterial.name,
            description: mixed ? `Matière première · ${detail}` : detail,
            kind: "RAW_MATERIAL",
            rawMaterial,
          };
        }),
        ...productRows.map((product): PurchaseItemOption => {
          products.current.set(product.id, product);
          const detail = `${product.baseUnit.name} · ${product.category.name}`;
          return {
            value: product.id,
            label: product.name,
            description: mixed ? `Produit de revente · ${detail}` : detail,
            kind: "PRODUCT",
            product,
          };
        }),
      ];
    },
    [searchRawMaterials, searchProducts, withRawMaterials, withProducts, mixed],
  );

  const handleChange = (next: EditorLine[]) => {
    const previousByKey = new Map(lines.map((line) => [line.key, line]));
    const defaultKind: PurchaseLineKind = withRawMaterials
      ? "RAW_MATERIAL"
      : "PRODUCT";

    onChange(
      next.map((line) => {
        const previous = previousByKey.get(line.key);
        const candidate = line as PurchaseEditorLine;

        if (!previous) {
          return {
            ...candidate,
            kind: defaultKind,
            rawMaterial: null,
            product: null,
            factorToBase: "1",
          };
        }

        if (line.item?.value !== previous.item?.value) {
          const product = line.item
            ? (products.current.get(line.item.value) ?? null)
            : null;
          if (product) {
            return {
              ...candidate,
              kind: "PRODUCT",
              rawMaterial: null,
              product,
              unitId: product.baseUnitId,
              factorToBase: "1",
            };
          }
          const rawMaterial = line.item
            ? (rawMaterials.current.get(line.item.value) ?? null)
            : null;
          return {
            ...candidate,
            kind: rawMaterial ? "RAW_MATERIAL" : defaultKind,
            rawMaterial,
            product: null,
            unitId: rawMaterial?.baseUnitId ?? null,
            factorToBase: "1",
          };
        }

        // A line with an item always has a unit: a unit select emptied
        // while its options were changing falls back to the base unit.
        if (!line.unitId && (previous.product ?? previous.rawMaterial)) {
          return {
            ...candidate,
            unitId:
              previous.product?.baseUnitId ??
              previous.rawMaterial?.baseUnitId ??
              null,
            factorToBase: "1",
          };
        }

        if (line.unitId !== previous.unitId && previous.rawMaterial) {
          return {
            ...candidate,
            factorToBase: factorFor(previous.rawMaterial, line.unitId),
          };
        }

        return candidate;
      }),
    );
  };

  return (
    <LineEditor
      lines={lines}
      onChange={handleChange}
      loadItems={loadItems}
      itemLabel={mixed ? "Article" : labels[kinds[0] ?? "RAW_MATERIAL"]}
      unitsFor={(line) => {
        const { rawMaterial, product } = line as PurchaseEditorLine;
        if (product) {
          return [{ value: product.baseUnitId, label: product.baseUnit.name }];
        }
        if (!rawMaterial) {
          return [];
        }
        return [
          { value: rawMaterial.baseUnitId, label: rawMaterial.baseUnit.name },
          ...rawMaterial.conversions
            .filter((conversion) => conversion.isActive)
            .map((conversion) => ({
              value: conversion.unitId,
              label: conversion.unit.name,
            })),
        ];
      }}
      // Nothing under the quantity when the unit is the base unit (issue
      // 016). With another unit, the quantity says what it amounts to in
      // the base unit and the price says which unit it is for.
      lineHint={(line) => {
        const { rawMaterial, factorToBase, quantity } =
          line as PurchaseEditorLine;
        if (!rawMaterial || isBaseUnit(factorToBase)) {
          return null;
        }
        return `= ${formatQuantity(safeTimes(quantity, factorToBase), rawMaterial.baseUnit.symbol)}`;
      }}
      priceHint={(line) => {
        const { rawMaterial, factorToBase } = line as PurchaseEditorLine;
        return rawMaterial && !isBaseUnit(factorToBase)
          ? `par ${rawMaterial.baseUnit.symbol}`
          : null;
      }}
      lineTotalFor={(line) =>
        purchaseLineTotal(line as PurchaseEditorLine).toFixed(3)
      }
      // The price is per base unit: a typed total divides by the base
      // quantity (entered quantity × the unit's factor). Issue 009.
      unitPriceFromTotal={(line, totalTnd) => {
        const { factorToBase, quantity } = line as PurchaseEditorLine;
        const base = safeTimes(quantity, factorToBase || "1");
        return unitPriceForTotal(base, totalTnd);
      }}
      errors={errors}
      disabled={disabled}
    />
  );
}

/// The symbol of the unit a line's stock is counted in.
export function baseUnitSymbolOf(line: PurchaseEditorLine): string {
  return (
    line.product?.baseUnit.symbol ?? line.rawMaterial?.baseUnit.symbol ?? ""
  );
}

function isBaseUnit(factorToBase: string): boolean {
  try {
    return new Decimal(factorToBase || 1).equals(1);
  } catch {
    return true;
  }
}

function safeTimes(quantity: string, factor: string): string {
  try {
    return new Decimal(quantity.replace(",", ".") || 0)
      .times(factor || 1)
      .toString();
  } catch {
    return "0";
  }
}
