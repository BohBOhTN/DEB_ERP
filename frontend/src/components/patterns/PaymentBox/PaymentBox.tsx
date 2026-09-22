import Decimal from "decimal.js-light";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { Button } from "../../ui/Button/Button.js";
import { FormField } from "../../ui/FormField/FormField.js";
import { MoneyInput } from "../../ui/MoneyInput/MoneyInput.js";
import { Select } from "../../ui/Select/Select.js";
import styles from "./PaymentBox.module.css";

export interface PaymentBoxProps {
  /// Amount owed for this document or party, decimal string.
  dueTnd: string;
  amountTnd: string;
  onAmountChange: (amount: string) => void;
  /// Cash only in V2 (OD-V2-012); the select exists so a second method is
  /// one option away.
  method?: "CASH";
  onMethodChange?: (method: "CASH") => void;
  error?: string;
  disabled?: boolean;
  /// Whether paying more than the amount due is refused (payments) or
  /// allowed (POS change). Default refuses.
  allowOverpayment?: boolean;
  className?: string;
}

/// Amount, method and the "Reste à payer" readout shared by POS, orders and
/// the three payment screens (05 section 3.2).
export function PaymentBox({
  dueTnd,
  amountTnd,
  onAmountChange,
  method = "CASH",
  onMethodChange,
  error,
  disabled = false,
  allowOverpayment = false,
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
    : fr.remaining;

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.due}>
        <span>{fr.amountOwed}</span>
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
        <FormField label={fr.paymentMethod}>
          <Select
            options={[{ value: "CASH", label: fr.cash }]}
            value={method}
            onValueChange={(next) => next && onMethodChange?.(next)}
            disabled={disabled || !onMethodChange}
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
          Tout régler
        </Button>
        {["5", "10", "20", "50"].map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onAmountChange(preset)}
          >
            {preset}
          </Button>
        ))}
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
