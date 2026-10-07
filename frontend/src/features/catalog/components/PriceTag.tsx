import type { CSSProperties } from "react";
import { fr } from "../../../i18n/fr.js";
import { formatMoney } from "../../../i18n/format.js";
import type { Product } from "../catalog.api.js";
import type { TagSlot } from "./tagLayout.js";
import styles from "./PriceTag.module.css";

export const TAG_LOGO_SRC = "/assets/dar-el-barka-logo.webp";

/// Issue 024: one price tag, laid in its slot on the sheet (`DEC-V2-014`).
/// Centred composition inside a double gold frame: the logo with the
/// bakery's name, an ornament, the product's name in the serif, the price
/// in a navy band with smaller decimals. The type scales with the tag so
/// every format reads alike. A turned slot draws the tag at its own size
/// and rotates it a quarter turn into the box the slot occupies.
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
  const amount = formatMoney(product.salePriceTnd, { unit: false });
  const comma = amount.lastIndexOf(",");
  const whole = comma === -1 ? amount : amount.slice(0, comma);
  const decimals = comma === -1 ? "" : amount.slice(comma);

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
            <span className={styles.logoRing}>
              <img
                src={TAG_LOGO_SRC}
                alt=""
                className={styles.logo}
                decoding="sync"
              />
            </span>
            <span className={styles.wordmark}>{fr.appName}</span>
          </div>
          <div className={styles.ornament} aria-hidden="true">
            <span className={styles.rule} />
            <span className={styles.diamond} />
            <span className={styles.rule} />
          </div>
          <div className={styles.nameBox}>
            <h3 className={styles.name}>{product.name}</h3>
          </div>
          <p className={styles.price}>
            <span className={styles.amount}>
              {whole}
              {decimals ? (
                <span className={styles.decimals}>{decimals}</span>
              ) : null}
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
