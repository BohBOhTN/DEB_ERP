import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import styles from "./TotalsCard.module.css";

export interface TotalsCardProps {
  subtotalTnd?: string;
  paidTnd?: string;
  remainingTnd?: string;
  totalTnd: string;
  /// Client-side figures are provisional until the server confirms them.
  provisional?: boolean;
  className?: string;
}

/// Subtotal, paid, remaining and the big total for POS, purchases and orders.
export function TotalsCard({
  subtotalTnd,
  paidTnd,
  remainingTnd,
  totalTnd,
  provisional = false,
  className,
}: TotalsCardProps) {
  return (
    <dl className={cx(styles.root, className)}>
      {subtotalTnd !== undefined ? (
        <div className={styles.row}>
          <dt>{fr.subtotal}</dt>
          <dd className="tabular-nums">{formatMoney(subtotalTnd)}</dd>
        </div>
      ) : null}
      {paidTnd !== undefined ? (
        <div className={styles.row}>
          <dt>{fr.paidAmount}</dt>
          <dd className="tabular-nums">{formatMoney(paidTnd)}</dd>
        </div>
      ) : null}
      {remainingTnd !== undefined ? (
        <div
          className={cx(
            styles.row,
            Number(remainingTnd) > 0 && styles.remainingDue,
          )}
        >
          <dt>{fr.remaining}</dt>
          <dd className="tabular-nums">{formatMoney(remainingTnd)}</dd>
        </div>
      ) : null}
      <div className={cx(styles.row, styles.total)}>
        <dt>
          {fr.total}
          {provisional ? (
            <span className={styles.provisional}> (provisoire)</span>
          ) : null}
        </dt>
        <dd className="tabular-nums">{formatMoney(totalTnd)}</dd>
      </div>
    </dl>
  );
}
