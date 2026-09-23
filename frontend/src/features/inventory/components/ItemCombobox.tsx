import { useCallback, useMemo, useRef } from "react";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { formatQuantity } from "../../../i18n/format.js";
import { listProducts, listRawMaterials } from "../../catalog/catalog.api.js";
import type { InventoryBalance, InventoryItemType } from "../inventory.api.js";
import { useBalances } from "../inventory.queries.js";
import type { PickedItem } from "../inventory.schemas.js";

export interface ItemComboboxProps {
  value: PickedItem | null;
  onChange: (item: PickedItem | null) => void;
  /// Restrict to one kind of item; both by default.
  itemTypes?: readonly InventoryItemType[];
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
}

interface ItemOption extends ComboboxOption {
  item: PickedItem;
}

const typeLabels: Record<InventoryItemType, string> = {
  PRODUCT: "Produit",
  RAW_MATERIAL: "Matière première",
};

/// Searches products and raw materials by name through the two list
/// endpoints with `q`, and shows the current balance next to each item so
/// nobody ever types an identifier (07 section 4.2). Shared with
/// procurement and simulation later.
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

  const loadOptions = useCallback(
    async (query: string): Promise<ItemOption[]> => {
      const listQuery = {
        page: 1,
        pageSize: 8,
        q: query || undefined,
        isActive: true,
        sort: { field: "name", direction: "asc" as const },
      };
      const [products, rawMaterials] = await Promise.all([
        itemTypes.includes("PRODUCT")
          ? listProducts(listQuery)
          : Promise.resolve(null),
        itemTypes.includes("RAW_MATERIAL")
          ? listRawMaterials(listQuery)
          : Promise.resolve(null),
      ]);
      const balanceOf = (itemId: string) =>
        balancesRef.current.find((row) => row.itemId === itemId);

      const options: ItemOption[] = [
        ...(products?.items ?? [])
          .filter((product) => product.isStockable)
          .map((product) => {
            const balance = balanceOf(product.id);
            const item: PickedItem = {
              itemType: "PRODUCT",
              itemId: product.id,
              label: product.name,
              unitSymbol: product.baseUnit.symbol,
              currentQuantity: balance?.quantity ?? "0",
            };
            return {
              value: `PRODUCT:${product.id}`,
              label: product.name,
              description: describe("PRODUCT", item),
              item,
            };
          }),
        ...(rawMaterials?.items ?? []).map((rawMaterial) => {
          const balance = balanceOf(rawMaterial.id);
          const item: PickedItem = {
            itemType: "RAW_MATERIAL",
            itemId: rawMaterial.id,
            label: rawMaterial.name,
            unitSymbol: rawMaterial.baseUnit.symbol,
            currentQuantity: balance?.quantity ?? "0",
          };
          return {
            value: `RAW_MATERIAL:${rawMaterial.id}`,
            label: rawMaterial.name,
            description: describe("RAW_MATERIAL", item),
            item,
          };
        }),
      ];

      return options.sort((a, b) => a.label.localeCompare(b.label, "fr"));
    },
    [itemTypes],
  );

  const selected = useMemo<ItemOption | null>(
    () =>
      value
        ? {
            value: `${value.itemType}:${value.itemId}`,
            label: value.label,
            description: describe(value.itemType, value),
            item: value,
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
      onChange={(option) => onChange(option?.item ?? null)}
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
