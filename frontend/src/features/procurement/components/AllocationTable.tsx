import Decimal from "decimal.js-light";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { cx } from "../../../lib/cx.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { safeDecimal } from "../procurement.schemas.js";
import styles from "./ProcurementForms.module.css";

export interface AllocationRow {
  purchaseId: string;
  reference: string | null;
  dueDate: string | null;
  balanceTnd: string;
  amountTnd: string;
  overdue?: boolean;
}

export interface AllocationTableProps {
  amountTnd: string;
  rows: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
}

export function allocatedTotal(rows: Array<{ amountTnd: string }>): Decimal {
  return rows.reduce(
    (sum, row) => sum.plus(safeDecimal(row.amountTnd)),
    new Decimal(0),
  );
}

/// Allocations of a payment to open purchases (07 section 4.3): one money
/// input per open purchase, the remaining due beside it, and the
/// unallocated remainder recomputed on every keystroke. Generalised for
/// customers in Sprint 22.
export function AllocationTable({
  amountTnd,
  rows,
  onChange,
  errors = {},
  disabled = false,
}: AllocationTableProps) {
  const allocated = allocatedTotal(rows);
  const unallocated = safeDecimal(amountTnd).minus(allocated);
  const over = unallocated.lessThan(0);

  return (
    <div className={styles.allocations} role="group" aria-label="Affectations">
      {rows.length === 0 ? (
        <p className={styles.error}>
          Aucun achat ouvert : le paiement restera non affecté.
        </p>
      ) : null}
      {rows.map((row, index) => {
        const error = errors[`allocations.${index}.amountTnd`];
        const label = row.reference ?? "Achat";

        return (
          <div key={row.purchaseId} className={styles.allocationRow}>
            <div className={styles.allocationMeta}>
              <strong>{label}</strong>
              <small>
                Reste dû {formatMoney(row.balanceTnd)}
                {row.dueDate ? ` · échéance ${formatDate(row.dueDate)}` : ""}
              </small>
              {row.overdue ? <Badge tone="danger">En retard</Badge> : null}
              {error ? <span className={styles.error}>{error}</span> : null}
            </div>
            <MoneyInput
              aria-label={`Affectation ${label}`}
              className={styles.allocationInput}
              value={row.amountTnd}
              onChange={(amount) =>
                onChange(
                  rows.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, amountTnd: amount }
                      : candidate,
                  ),
                )
              }
              invalid={Boolean(error)}
              disabled={disabled}
            />
          </div>
        );
      })}
      {errors.allocations ? (
        <p className={styles.error}>{errors.allocations}</p>
      ) : null}
      <div
        className={cx(styles.unallocated, over && styles.over)}
        aria-live="polite"
      >
        <span>{over ? "Affectations en excès" : "Reste non alloué"}</span>
        <span className="tabular-nums">
          {formatMoney(unallocated.abs().toFixed(3))}
        </span>
      </div>
    </div>
  );
}
