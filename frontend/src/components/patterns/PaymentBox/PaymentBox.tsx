import Decimal from "decimal.js-light";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../../ui/Button/Button.js";
import { FormField } from "../../ui/FormField/FormField.js";
import { MoneyInput } from "../../ui/MoneyInput/MoneyInput.js";
import styles from "./PaymentBox.module.css";

export interface PaymentBoxProps {
  /// Amount owed for this document or party, decimal string.
  dueTnd: string;
  amountTnd: string;
  onAmountChange: (amount: string) => void;
  error?: string;
  disabled?: boolean;
  /// Whether paying more than the amount due is refused (payments) or
  /// allowed (POS change). Default refuses.
  allowOverpayment?: boolean;
  /// Wording for a deposit ("Reste à verser", "Verser le reste") instead of
  /// the payment defaults; presets can be hidden when they make no sense.
  dueLabel?: string;
  settleLabel?: string;
  remainingLabel?: string;
  presets?: boolean;
  className?: string;
}

/// Amount and the "Reste à payer" readout shared by POS, orders and the
/// three payment screens (05 section 3.2). Cash is the only method
/// (OD-V2-012), so no method control is shown; the data model keeps the
/// enum for the day a second method is approved.
export function PaymentBox({
  dueTnd,
  amountTnd,
  onAmountChange,
  error,
  disabled = false,
  allowOverpayment = false,
  dueLabel = fr.amountOwed,
  settleLabel = "Tout régler",
  remainingLabel: remainingCopy = fr.remaining,
  presets = true,
  className,
}: PaymentBoxProps) {
  const due = safeDecimal(dueTnd);
  const amount = safeDecimal(amountTnd);
  const remaining = due.minus(amount);
  const overpaid = remaining.lessThan(0);
  const remainingLabel = overpaid
    ? allowOverpayment
      ? "Monnaie à rendre"
      : "Dépasse le montant dû"
    : remainingCopy;

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.due}>
        <span>{dueLabel}</span>
        <strong className="tabular-nums">{formatMoney(dueTnd)}</strong>
      </div>
      <div className={styles.fields}>
        <FormField
          label={fr.amount}
          error={
            error ??
            (overpaid && !allowOverpayment
              ? "Le montant dépasse le montant dû."
              : undefined)
          }
          required
        >
          <MoneyInput
            value={amountTnd}
            onChange={onAmountChange}
            disabled={disabled}
          />
        </FormField>
      </div>
      <div className={styles.shortcuts}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onAmountChange(due.toFixed(3))}
        >
          {settleLabel}
        </Button>
        {presets
          ? ["5", "10", "20", "50"].map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onAmountChange(preset)}
              >
                {preset}
              </Button>
            ))
          : null}
      </div>
      <div
        className={cx(
          styles.remaining,
          overpaid && !allowOverpayment && styles.over,
          overpaid && allowOverpayment && styles.change,
        )}
        aria-live="polite"
      >
        <span>{remainingLabel}</span>
        <strong className="tabular-nums">
          {formatMoney(remaining.abs().toFixed(3))}
        </strong>
      </div>
    </div>
  );
}

function safeDecimal(value: string): Decimal {
  try {
    return new Decimal(value || 0);
  } catch {
    return new Decimal(0);
  }
}
