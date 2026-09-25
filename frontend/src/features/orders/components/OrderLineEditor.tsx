import { useCallback, useRef } from "react";
import {
  LineEditor,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import type { ComboboxOption } from "../../../components/ui/Combobox/Combobox.js";
import { formatMoney } from "../../../i18n/format.js";
import { useCachedSearch } from "../../../lib/query/cachedOptions.js";
import { roots } from "../../../lib/query/invalidation.js";
import { listProducts } from "../../catalog/catalog.api.js";
import { listPosProducts } from "../../pos/pos.api.js";

/// What a picked product brings to a line, whichever list it came from.
export interface PickedProduct {
  id: string;
  name: string;
  salePriceTnd: string;
  /// Known from the catalogue list with `margin.view` only (issue #48).
  approximateCostTnd: string | null;
  baseUnitId: string;
  categoryName: string;
}

interface ProductOption extends ComboboxOption {
  product: PickedProduct;
}

export interface OrderLineEditorProps {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
  /// Orders and the till price from the catalogue on the server, so the
  /// price is shown, not edited (issue #45); a direct distributor sale
  /// snapshots the price entered (DST-009), so it is edited (issue 009).
  priceEditable?: boolean;
  /// `pos` reads the sellable list of the till; `catalog` reads the
  /// catalogue list, which carries the product's cost for the caller
  /// allowed to see it.
  source?: "pos" | "catalog";
  /// Told each time a line's product changes, with the record picked.
  onProductChange?: (lineKey: string, product: PickedProduct | null) => void;
}

const pageQuery = (query: string) => ({
  page: 1,
  pageSize: 8,
  q: query || undefined,
});

async function fetchPosProducts(query: string): Promise<PickedProduct[]> {
  const page = await listPosProducts(pageQuery(query));
  return page.items.map((product) => ({
    id: product.id,
    name: product.name,
    salePriceTnd: product.salePriceTnd,
    approximateCostTnd: null,
    baseUnitId: product.baseUnit.id,
    categoryName: product.category.name,
  }));
}

async function fetchCatalogProducts(query: string): Promise<PickedProduct[]> {
  const page = await listProducts({
    ...pageQuery(query),
    isActive: true,
    sort: { field: "name", direction: "asc" },
  });
  return page.items.map((product) => ({
    id: product.id,
    name: product.name,
    salePriceTnd: product.salePriceTnd,
    approximateCostTnd: product.approximateCostTnd ?? null,
    baseUnitId: product.baseUnit.id,
    categoryName: product.category.name,
  }));
}

/// Product lines of an order, a direct sale or the till (07 section 4.5):
/// the picker searches by name, code or barcode through the session cache
/// (issue 009), and picking a product fills its sale price and unit.
export function OrderLineEditor({
  lines,
  onChange,
  errors,
  disabled,
  priceEditable = false,
  source = "pos",
  onProductChange,
}: OrderLineEditorProps) {
  const cache = useRef(new Map<string, PickedProduct>());
  const search = useCachedSearch(
    source === "catalog" ? roots.catalogProducts : roots.posProducts,
    source === "catalog" ? fetchCatalogProducts : fetchPosProducts,
  );

  const loadItems = useCallback(
    async (query: string): Promise<ProductOption[]> => {
      const products = await search(query);
      return products.map((product) => {
        cache.current.set(product.id, product);
        return {
          value: product.id,
          label: product.name,
          description: `${formatMoney(product.salePriceTnd)} · ${product.categoryName}`,
          product,
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
        if (previous && line.item?.value !== previous.item?.value) {
          const product = line.item
            ? (cache.current.get(line.item.value) ?? null)
            : null;
          onProductChange?.(line.key, product);
          return product
            ? {
                ...line,
                unitPriceTnd: product.salePriceTnd,
                unitId: product.baseUnitId,
              }
            : line;
        }
        return line;
      }),
    );
  };

  return (
    <LineEditor
      lines={lines}
      onChange={handleChange}
      priceEditable={priceEditable}
      loadItems={loadItems}
      itemLabel="Produit"
      errors={errors}
      disabled={disabled}
    />
  );
}
