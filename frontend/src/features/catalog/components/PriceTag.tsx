import type { CSSProperties } from "react";
import { fr } from "../../../i18n/fr.js";
import { formatMoney } from "../../../i18n/format.js";
import type { Product } from "../catalog.api.js";
import type { TagSlot } from "./tagLayout.js";
import styles from "./PriceTag.module.css";

export const TAG_LOGO_SRC = "/assets/dar-el-barka-logo-192.webp";

/// Issue 024: one price tag, laid in its slot on the sheet (`DEC-V2-014`).
/// The logo, the bakery's name, the product's name and its sale price; the
/// type scales with the tag so every format reads alike. A turned slot
/// draws the tag at its own size and rotates it a quarter turn into the
/// box the slot occupies.
export function PriceTag({
  product,
  slot,
}: {
  product: Product;
  slot: TagSlot;
}) {
  const widthMm = slot.rotated ? slot.heightMm : slot.widthMm;
  const heightMm = slot.rotated ? slot.widthMm : slot.heightMm;
  const scale = Math.min(
    3,
    Math.max(0.55, Math.min(widthMm / 70, heightMm / 40)),
  );
  const perUnit =
    product.baseUnit.precision > 0 ? product.baseUnit.symbol : null;

  return (
    <div
      className={styles.slot}
      style={{
        left: `${slot.xMm}mm`,
        top: `${slot.yMm}mm`,
        width: `${slot.widthMm}mm`,
        height: `${slot.heightMm}mm`,
      }}
      data-rotated={slot.rotated ? "true" : undefined}
    >
      <article
        className={styles.tag}
        aria-label={`${product.name}, ${formatMoney(product.salePriceTnd)}`}
        style={
          {
            width: `${widthMm}mm`,
            height: `${heightMm}mm`,
            "--tag-scale": scale,
          } as CSSProperties
        }
      >
        <div className={styles.frame}>
          <div className={styles.brand}>
            <img
              src={TAG_LOGO_SRC}
              alt=""
              className={styles.logo}
              decoding="sync"
            />
            <span className={styles.wordmark}>{fr.appName}</span>
          </div>
          <h3 className={styles.name}>{product.name}</h3>
          <p className={styles.price}>
            <span className={styles.amount}>
              {formatMoney(product.salePriceTnd, { unit: false })}
            </span>
            <span className={styles.currency}>
              {fr.currency}
              {perUnit ? ` / ${perUnit}` : ""}
            </span>
          </p>
        </div>
      </article>
    </div>
  );
}
