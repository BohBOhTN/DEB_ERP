import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../../ui/Button/Button.js";
import { EmptyState } from "../../ui/EmptyState/EmptyState.js";
import { Skeleton } from "../../ui/Skeleton/Skeleton.js";
import styles from "./StatementTable.module.css";

export interface StatementEntry {
  id: string;
  at: string | Date;
  reference?: string | null;
  label: ReactNode;
  /// Decimal strings; one of the two is usually empty.
  debitTnd?: string | null;
  creditTnd?: string | null;
  balanceTnd: string;
  href?: string;
}

export interface StatementTableProps {
  label: string;
  entries: StatementEntry[];
  openingBalanceTnd: string;
  closingBalanceTnd: string;
  /// Human range and calculation basis (NFR-007): "Du 01/09/2026 au
  /// 22/09/2026 · solde = ventes à crédit − règlements".
  rangeLabel: string;
  basisLabel: string;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  className?: string;
}

/// Ledger statement with running balance, the date range and the basis of
/// the calculation stated on screen (05 section 3.2).
export function StatementTable({
  label,
  entries,
  openingBalanceTnd,
  closingBalanceTnd,
  rangeLabel,
  basisLabel,
  loading = false,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  className,
}: StatementTableProps) {
  return (
    <div className={cx(styles.root, className)}>
      <p className={styles.basis}>
        <span>{rangeLabel}</span>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <span>{basisLabel}</span>
      </p>
      {loading ? (
        <Skeleton variant="table" rows={6} />
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table} aria-label={label}>
            <thead>
              <tr>
                <th scope="col">{fr.date}</th>
                <th scope="col">{fr.reference}</th>
                <th scope="col">Libellé</th>
                <th scope="col" className={styles.right}>
                  Débit
                </th>
                <th scope="col" className={styles.right}>
                  Crédit
                </th>
                <th scope="col" className={styles.right}>
                  {fr.balance}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.balanceRow}>
                <td colSpan={5}>Solde d'ouverture</td>
                <td className={cx(styles.right, "tabular-nums")}>
                  {formatMoney(openingBalanceTnd)}
                </td>
              </tr>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      size="sm"
                      title="Aucune écriture sur la période"
                    />
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="tabular-nums">{formatDate(entry.at)}</td>
                    <td>
                      {entry.href && entry.reference ? (
                        <a href={entry.href}>{entry.reference}</a>
                      ) : (
                        (entry.reference ?? "—")
                      )}
                    </td>
                    <td>{entry.label}</td>
                    <td className={cx(styles.right, "tabular-nums")}>
                      {entry.debitTnd ? formatMoney(entry.debitTnd) : ""}
                    </td>
                    <td className={cx(styles.right, "tabular-nums")}>
                      {entry.creditTnd ? formatMoney(entry.creditTnd) : ""}
                    </td>
                    <td
                      className={cx(
                        styles.right,
                        styles.balance,
                        "tabular-nums",
                      )}
                    >
                      {formatMoney(entry.balanceTnd)}
                    </td>
                  </tr>
                ))
              )}
              <tr className={styles.balanceRow}>
                <td colSpan={5}>Solde de clôture</td>
                <td className={cx(styles.right, "tabular-nums")}>
                  {formatMoney(closingBalanceTnd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {hasMore && onLoadMore ? (
        <div className={styles.more}>
          <Button
            variant="secondary"
            onClick={onLoadMore}
            loading={loadingMore}
          >
            Afficher la suite
          </Button>
        </div>
      ) : null}
    </div>
  );
}
