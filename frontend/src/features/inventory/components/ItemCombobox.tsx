import { useCallback, useMemo, useRef } from "react";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { formatQuantity } from "../../../i18n/format.js";
import { useCachedSearch } from "../../../lib/query/cachedOptions.js";
import { roots } from "../../../lib/query/invalidation.js";
import {
  listProducts,
  listRawMaterials,
  type Product,
  type RawMaterial,
} from "../../catalog/catalog.api.js";

const pickerQuery = (query: string) => ({
  page: 1,
  pageSize: 8,
  q: query || undefined,
  isActive: true,
  sort: { field: "name", direction: "asc" as const },
});

async function fetchProducts(query: string): Promise<Product[]> {
  return (await listProducts(pickerQuery(query))).items;
}

async function fetchRawMaterials(query: string): Promise<RawMaterial[]> {
  return (await listRawMaterials(pickerQuery(query))).items;
}
import type { InventoryBalance, InventoryItemType } from "../inventory.api.js";
import { useBalances } from "../inventory.queries.js";
import type { PickedItem } from "../inventory.schemas.js";

/// The full record behind a picked item, for callers that need more than the
/// picker keeps (conversions of a raw material, price of a product).
export type ItemSource =
  | { kind: "PRODUCT"; product: Product }
  | { kind: "RAW_MATERIAL"; rawMaterial: RawMaterial };

export interface ItemComboboxProps {
  value: PickedItem | null;
  onChange: (item: PickedItem | null, source: ItemSource | null) => void;
  /// Restrict to one kind of item; both by default.
  itemTypes?: readonly InventoryItemType[];
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
}

interface ItemOption extends ComboboxOption {
  item: PickedItem;
  source: ItemSource;
}

const typeLabels: Record<InventoryItemType, string> = {
  PRODUCT: "Produit",
  RAW_MATERIAL: "Matière première",
};

/// Searches products and raw materials by name through the two list
/// endpoints with `q`, and shows the current balance next to each item so
/// nobody ever types an identifier (07 section 4.2). Shared with
/// procurement and simulation.
export function ItemCombobox({
  value,
  onChange,
  itemTypes = ["PRODUCT", "RAW_MATERIAL"],
  disabled,
  invalid,
  id,
  ...rest
}: ItemComboboxProps) {
  const balances = useBalances();
  const balancesRef = useRef<InventoryBalance[]>([]);
  balancesRef.current = balances.data ?? [];
  // Issue 009: the two lists are read once per query for the session; the
  // balance next to each item is applied after the read, so it stays live.
  const searchProducts = useCachedSearch(roots.catalogProducts, fetchProducts, {
    prefetch: itemTypes.includes("PRODUCT"),
  });
  const searchRawMaterials = useCachedSearch(
    roots.catalogRawMaterials,
    fetchRawMaterials,
    { prefetch: itemTypes.includes("RAW_MATERIAL") },
  );

  const loadOptions = useCallback(
    async (query: string): Promise<ItemOption[]> => {
      const [products, rawMaterials] = await Promise.all([
        itemTypes.includes("PRODUCT")
          ? searchProducts(query)
          : Promise.resolve(null),
        itemTypes.includes("RAW_MATERIAL")
          ? searchRawMaterials(query)
          : Promise.resolve(null),
      ]);
      const balanceOf = (itemId: string) =>
        balancesRef.current.find((row) => row.itemId === itemId);

      const options: ItemOption[] = [
        ...(products ?? [])
          .filter((product) => product.isStockable)
          .map((product) => {
            const item: PickedItem = {
              itemType: "PRODUCT",
              itemId: product.id,
              label: product.name,
              unitSymbol: product.baseUnit.symbol,
              currentQuantity: balanceOf(product.id)?.quantity ?? "0",
            };
            return {
              value: `PRODUCT:${product.id}`,
              label: product.name,
              description: describe("PRODUCT", item),
              item,
              source: { kind: "PRODUCT" as const, product },
            };
          }),
        ...(rawMaterials ?? []).map((rawMaterial) => {
          const item: PickedItem = {
            itemType: "RAW_MATERIAL",
            itemId: rawMaterial.id,
            label: rawMaterial.name,
            unitSymbol: rawMaterial.baseUnit.symbol,
            currentQuantity: balanceOf(rawMaterial.id)?.quantity ?? "0",
          };
          return {
            value: `RAW_MATERIAL:${rawMaterial.id}`,
            label: rawMaterial.name,
            description: describe("RAW_MATERIAL", item),
            item,
            source: { kind: "RAW_MATERIAL" as const, rawMaterial },
          };
        }),
      ];

      return options.sort((a, b) => a.label.localeCompare(b.label, "fr"));
    },
    [itemTypes, searchProducts, searchRawMaterials],
  );

  const selected = useMemo<ItemOption | null>(
    () =>
      value
        ? {
            value: `${value.itemType}:${value.itemId}`,
            label: value.label,
            description: describe(value.itemType, value),
            item: value,
            // The record is only known from a load; the selected value shows the label.
            source: null as unknown as ItemSource,
          }
        : null,
    [value],
  );

  return (
    <Combobox<ItemOption>
      id={id}
      aria-label={rest["aria-label"]}
      loadOptions={loadOptions}
      value={selected}
      onChange={(option) =>
        onChange(option?.item ?? null, option?.source ?? null)
      }
      placeholder="Nom de l'article"
      emptyText="Aucun article"
      disabled={disabled}
      invalid={invalid}
    />
  );
}

function describe(itemType: InventoryItemType, item: PickedItem): string {
  return `${typeLabels[itemType]} · stock actuel ${formatQuantity(item.currentQuantity, item.unitSymbol)}`;
}
