import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button/Button.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { QuantityInput } from "../../../components/ui/QuantityInput/QuantityInput.js";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import { cartTotal, lineTotal, useCartStore } from "../cart.store.js";
import styles from "./PosComponents.module.css";

/// The cart lines with a quantity stepper, unit price, line total and
/// removal; "Vider le panier" at the bottom (07 section 4.6).
export function CartPanel() {
  const lines = useCartStore((state) => state.lines);
  const increment = useCartStore((state) => state.increment);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.remove);
  const clear = useCartStore((state) => state.clear);

  if (lines.length === 0) {
    return (
      <EmptyState
        size="sm"
        title="Panier vide"
        description="Touchez un produit pour l'ajouter."
      />
    );
  }

  return (
    <div className={styles.cart}>
      <ul className={styles.cartLines} aria-label="Panier">
        {lines.map((line) => (
          <li key={line.productId} className={styles.cartLine}>
            <div className={styles.cartLineMeta}>
              <strong>{line.name}</strong>
              <small>
                {formatMoney(line.unitPriceTnd)} / {line.unitSymbol}
              </small>
            </div>
            <div className={styles.cartLineControls}>
              <IconButton
                label={`Retirer un ${line.name}`}
                icon={<Minus />}
                size="sm"
                onClick={() => increment(line.productId, -1)}
              />
              <QuantityInput
                aria-label={`Quantité ${line.name}`}
                className={styles.cartLineQuantity}
                value={line.quantity}
                onChange={(quantity) => setQuantity(line.productId, quantity)}
              />
              <IconButton
                label={`Ajouter un ${line.name}`}
                icon={<Plus />}
                size="sm"
                onClick={() => increment(line.productId, 1)}
              />
              <IconButton
                label={`Supprimer ${line.name}`}
                icon={<Trash2 />}
                size="sm"
                variant="danger"
                onClick={() => remove(line.productId)}
              />
            </div>
            <span className={cx(styles.cartLineTotal, "tabular-nums")}>
              <span>Total ligne</span>
              <span>{formatMoney(lineTotal(line).toFixed(3))}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.cartFooter}>
        <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={clear}>
          Vider le panier
        </Button>
        <strong className="tabular-nums">
          {formatMoney(cartTotal(lines).toFixed(3))}
        </strong>
      </div>
    </div>
  );
}
