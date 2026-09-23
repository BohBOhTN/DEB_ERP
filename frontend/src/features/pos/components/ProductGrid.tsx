import { Minus, Plus } from "lucide-react";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import type { PosProduct } from "../pos.api.js";
import styles from "./PosComponents.module.css";

export interface ProductGridProps {
  products: PosProduct[];
  quantities: ReadonlyMap<string, string>;
  onAdd: (product: PosProduct) => void;
  onIncrement: (productId: string, step: number) => void;
}

/// One of four brand tones per category, stable across renders, since
/// categories carry no colour of their own (OD-V2-007: no images).
export function categoryTone(categoryId: string): 1 | 2 | 3 | 4 {
  let hash = 0;
  for (const char of categoryId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return ((hash % 4) + 1) as 1 | 2 | 3 | 4;
}

/// Product tiles (07 section 4.6): tap adds one; a product already in the
/// cart shows its quantity with `+` and `−` on the tile.
export function ProductGrid({
  products,
  quantities,
  onAdd,
  onIncrement,
}: ProductGridProps) {
  return (
    <div className={styles.grid} role="list" aria-label="Produits">
      {products.map((product) => {
        const quantity = quantities.get(product.id);
        const tone = categoryTone(product.category.id);
        return (
          <div
            key={product.id}
            role="listitem"
            className={cx(
              styles.tile,
              quantity && styles.inCart,
              tone === 2 && styles.tone2,
              tone === 3 && styles.tone3,
              tone === 4 && styles.tone4,
            )}
          >
            <button
              type="button"
              className={styles.tileName}
              onClick={() => onAdd(product)}
              aria-label={`Ajouter ${product.name}`}
            >
              {product.name}
            </button>
            <span className={styles.tilePrice}>
              {formatMoney(product.salePriceTnd)} / {product.baseUnit.symbol} ·{" "}
              {product.category.name}
            </span>
            {/* The stepper row is always laid out so a tile never grows on tap:
                a growing tile would shift its neighbours under a fast finger. */}
            {quantity ? (
              <div className={styles.tileStepper}>
                <IconButton
                  label={`Retirer un ${product.name}`}
                  icon={<Minus />}
                  size="sm"
                  onClick={() => onIncrement(product.id, -1)}
                />
                <span
                  className={cx(styles.tileQuantity, "tabular-nums")}
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <IconButton
                  label={`Ajouter un ${product.name}`}
                  icon={<Plus />}
                  size="sm"
                  onClick={() => onIncrement(product.id, 1)}
                />
              </div>
            ) : (
              <div className={styles.tileStepper} aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}
