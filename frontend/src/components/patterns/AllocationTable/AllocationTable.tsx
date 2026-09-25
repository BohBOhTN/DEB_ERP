import Decimal from "decimal.js-light";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import { Badge } from "../../ui/Badge/Badge.js";
import { Button } from "../../ui/Button/Button.js";
import { MoneyInput } from "../../ui/MoneyInput/MoneyInput.js";
import styles from "./AllocationTable.module.css";

/// One open document a payment can be allocated to: a purchase for a
/// supplier, a sale for a customer.
export interface AllocationRow {
  id: string;
  /// Document reference shown as the row title ("AC-000012", "VT-000034").
  label: string;
  /// Secondary line: due date, sale date, whatever helps recognise the row.
  meta?: string;
  balanceTnd: string;
  amountTnd: string;
  overdue?: boolean;
}

export interface AllocationTableProps {
  /// The amount being paid, decimal string.
  amountTnd: string;
  rows: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  /// Keys `allocations` (whole table) and `allocations.<index>.amountTnd`.
  errors?: Record<string, string | undefined>;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
}

export function allocatedTotal(rows: Array<{ amountTnd: string }>): Decimal {
  return rows.reduce(
    (sum, row) => sum.plus(safeDecimal(row.amountTnd)),
    new Decimal(0),
  );
}

/// Fills the rows from the amount in their order (the dialogs pass them
/// oldest first), each up to its remaining due. This is what the server does
/// with whatever the user leaves unallocated, so the table can show it
/// before posting.
export function autoAllocate<TRow extends AllocationRow>(
  rows: TRow[],
  amountTnd: string,
): TRow[] {
  let remainder = safeDecimal(amountTnd);

  return rows.map((row) => {
    const balance = safeDecimal(row.balanceTnd);
    const take = remainder.lessThan(balance) ? remainder : balance;
    remainder = remainder.minus(take);
    return {
      ...row,
      amountTnd: take.greaterThan(0) ? take.toFixed(3) : "",
    };
  });
}

/// Allocations of a payment to open documents (05 section 3.2): one money
/// input per document, the remaining due beside it, and the remainder
/// recomputed on every keystroke. What the user leaves is placed by the
/// server on the oldest documents; the "Répartir automatiquement" button
/// shows that split ahead of time. Shared by supplier, customer and
/// distributor payments.
export function AllocationTable({
  amountTnd,
  rows,
  onChange,
  errors = {},
  disabled = false,
  emptyText = "Aucun document ouvert : le paiement réduira le solde global.",
  className,
}: AllocationTableProps) {
  const allocated = allocatedTotal(rows);
  const unallocated = safeDecimal(amountTnd).minus(allocated);
  const over = unallocated.lessThan(0);

  return (
    <div
      className={cx(styles.root, className)}
      role="group"
      aria-label="Affectations"
    >
      {rows.length === 0 ? <p className={styles.error}>{emptyText}</p> : null}
      {rows.length > 0 ? (
        <div className={styles.toolbar}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || !safeDecimal(amountTnd).greaterThan(0)}
            onClick={() => onChange(autoAllocate(rows, amountTnd))}
          >
            Répartir automatiquement
          </Button>
        </div>
      ) : null}
      {rows.map((row, index) => {
        const error = errors[`allocations.${index}.amountTnd`];

        return (
          <div key={row.id} className={styles.row}>
            <div className={styles.meta}>
              <strong>{row.label}</strong>
              <small>
                Reste dû {formatMoney(row.balanceTnd)}
                {row.meta ? ` · ${row.meta}` : ""}
              </small>
              {row.overdue ? <Badge tone="danger">En retard</Badge> : null}
              {error ? <span className={styles.error}>{error}</span> : null}
            </div>
            <MoneyInput
              aria-label={`Affectation ${row.label}`}
              className={styles.input}
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
        <span>{over ? "Affectations en excès" : "Reste à répartir"}</span>
        <span className="tabular-nums">
          {formatMoney(unallocated.abs().toFixed(3))}
        </span>
      </div>
      {!over && unallocated.greaterThan(0) && rows.length > 0 ? (
        <p className={styles.hint}>
          Le reste sera affecté aux documents les plus anciens.
        </p>
      ) : null}
    </div>
  );
}

function safeDecimal(value: string): Decimal {
  try {
    return new Decimal(value.replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}
