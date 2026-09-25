import { useCallback, useRef } from "react";
import {
  LineEditor,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import type { ComboboxOption } from "../../../components/ui/Combobox/Combobox.js";
import { formatMoney } from "../../../i18n/format.js";
import { listPosProducts, type PosProduct } from "../../pos/pos.api.js";

interface ProductOption extends ComboboxOption {
  product: PosProduct;
}

export interface OrderLineEditorProps {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

/// Product lines of an order (07 section 4.5): the picker searches the POS
/// product list by name, code or barcode; picking a product fills its sale
/// price. The server prices every line from the catalogue, so the price is
/// shown, not edited (issue #45).
export function OrderLineEditor({
  lines,
  onChange,
  errors,
  disabled,
}: OrderLineEditorProps) {
  const cache = useRef(new Map<string, PosProduct>());

  const loadItems = useCallback(
    async (query: string): Promise<ProductOption[]> => {
      const page = await listPosProducts({
        page: 1,
        pageSize: 8,
        q: query || undefined,
      });

      return page.items.map((product) => {
        cache.current.set(product.id, product);
        return {
          value: product.id,
          label: product.name,
          description: `${formatMoney(product.salePriceTnd)} · ${product.category.name}`,
          product,
        };
      });
    },
    [],
  );

  const handleChange = (next: EditorLine[]) => {
    const previousByKey = new Map(lines.map((line) => [line.key, line]));
    onChange(
      next.map((line) => {
        const previous = previousByKey.get(line.key);
        if (
          previous &&
          line.item?.value !== previous.item?.value &&
          line.item
        ) {
          const product = cache.current.get(line.item.value);
          return product
            ? {
                ...line,
                unitPriceTnd: product.salePriceTnd,
                unitId: product.baseUnit.id,
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
      priceEditable={false}
      loadItems={loadItems}
      itemLabel="Produit"
      errors={errors}
      disabled={disabled}
    />
  );
}
