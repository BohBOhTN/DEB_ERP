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
  listRawMaterials,
  type RawMaterial,
} from "../../catalog/catalog.api.js";
import { purchaseLineTotal } from "../procurement.schemas.js";

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

/// A purchase line keeps the raw material record with it so the unit
/// options, the conversion factor and the base symbol never need a lookup.
export interface PurchaseEditorLine extends EditorLine {
  rawMaterial: RawMaterial | null;
  factorToBase: string;
}

interface RawMaterialOption extends ComboboxOption {
  rawMaterial: RawMaterial;
}

export interface PurchaseLineEditorProps {
  lines: PurchaseEditorLine[];
  onChange: (lines: PurchaseEditorLine[]) => void;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

export function newPurchaseLine(): PurchaseEditorLine {
  return { ...newLine(), rawMaterial: null, factorToBase: "1" };
}

export function lineFromRawMaterial(
  rawMaterial: RawMaterial,
  fields: { unitId: string; quantity: string; unitPriceTnd: string },
): PurchaseEditorLine {
  return {
    ...newLine(),
    item: { value: rawMaterial.id, label: rawMaterial.name },
    rawMaterial,
    quantity: fields.quantity,
    unitId: fields.unitId,
    unitPriceTnd: fields.unitPriceTnd,
    factorToBase: factorFor(rawMaterial, fields.unitId),
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

/// Raw material lines of a purchase (07 section 4.3): the picker searches
/// the catalogue by name, the unit list comes from the material's active
/// conversions and the hint states the base quantity ("= 50,000 kg") since
/// the price is per base unit.
export function PurchaseLineEditor({
  lines,
  onChange,
  errors,
  disabled,
}: PurchaseLineEditorProps) {
  const cache = useRef(new Map<string, RawMaterial>());
  // Issue 009: one read per query for the session, refreshed by a
  // raw-material write.
  const search = useCachedSearch(roots.catalogRawMaterials, fetchRawMaterials);

  const loadItems = useCallback(
    async (query: string): Promise<RawMaterialOption[]> => {
      const items = await search(query);

      return items.map((rawMaterial) => {
        cache.current.set(rawMaterial.id, rawMaterial);
        return {
          value: rawMaterial.id,
          label: rawMaterial.name,
          description: `${rawMaterial.baseUnit.name}${rawMaterial.category ? ` · ${rawMaterial.category}` : ""}`,
          rawMaterial,
        };
      });
    },
    [search],
  );

  const handleChange = (next: EditorLine[]) => {
    const previousByKey = new Map(lines.map((line) => [line.key, line]));

    onChange(
      next.map((line) => {
        const previous = previousByKey.get(line.key);
        const candidate = line as PurchaseEditorLine;

        if (!previous) {
          return { ...candidate, rawMaterial: null, factorToBase: "1" };
        }

        if (line.item?.value !== previous.item?.value) {
          const rawMaterial = line.item
            ? (cache.current.get(line.item.value) ?? null)
            : null;
          return {
            ...candidate,
            rawMaterial,
            unitId: rawMaterial?.baseUnitId ?? null,
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
      itemLabel="Matière première"
      unitsFor={(line) => {
        const rawMaterial = (line as PurchaseEditorLine).rawMaterial;
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
      lineHint={(line) => {
        const { rawMaterial, factorToBase, quantity } =
          line as PurchaseEditorLine;
        if (!rawMaterial) {
          return null;
        }
        const symbol = rawMaterial.baseUnit.symbol;
        if (new Decimal(factorToBase || 1).equals(1)) {
          return `Prix par ${symbol}`;
        }
        const base = safeTimes(quantity, factorToBase);
        return `= ${formatQuantity(base, symbol)} · prix par ${symbol}`;
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

function safeTimes(quantity: string, factor: string): string {
  try {
    return new Decimal(quantity.replace(",", ".") || 0)
      .times(factor || 1)
      .toString();
  } catch {
    return "0";
  }
}
