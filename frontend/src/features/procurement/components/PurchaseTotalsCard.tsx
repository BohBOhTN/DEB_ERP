import Decimal from "decimal.js-light";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import type { PurchasePaymentTerms } from "../procurement.api.js";
import { safeDecimal } from "../procurement.schemas.js";
import { paymentTermsLabels } from "./procurementLabels.js";
import styles from "./ProcurementForms.module.css";

export interface PurchaseTotalsCardProps {
  totalTnd: string;
  paymentTerms: PurchasePaymentTerms;
  onPaymentTermsChange: (terms: PurchasePaymentTerms) => void;
  paidAmountTnd: string;
  onPaidAmountChange: (amount: string) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  errors?: { paidAmountTnd?: string; dueDate?: string };
  disabled?: boolean;
}

/// The paid amount that the terms imply: the total, nothing, or what the
/// user typed for a partial purchase.
export function paidFor(
  terms: PurchasePaymentTerms,
  totalTnd: string,
  paidAmountTnd: string,
): Decimal {
  if (terms === "PAID") return safeDecimal(totalTnd);
  if (terms === "UNPAID") return new Decimal(0);
  return safeDecimal(paidAmountTnd);
}

/// Sticky totals column of the purchase editor (07 section 4.3): total,
/// terms, paid amount for a partial purchase, due date when a balance
/// remains, and the remaining due computed live.
export function PurchaseTotalsCard({
  totalTnd,
  paymentTerms,
  onPaymentTermsChange,
  paidAmountTnd,
  onPaidAmountChange,
  dueDate,
  onDueDateChange,
  errors = {},
  disabled = false,
}: PurchaseTotalsCardProps) {
  const paid = paidFor(paymentTerms, totalTnd, paidAmountTnd);
  const remaining = safeDecimal(totalTnd).minus(paid);

  return (
    <div>
      <TotalsCard
        totalTnd={totalTnd}
        paidTnd={paid.toFixed(3)}
        remainingTnd={remaining.greaterThan(0) ? remaining.toFixed(3) : "0"}
        provisional
      />
      <div className={styles.terms}>
        <FormField
          label="Conditions de paiement"
          labelIsElement={false}
          required
        >
          <SegmentedControl<PurchasePaymentTerms>
            label="Conditions de paiement"
            fullWidth
            value={paymentTerms}
            onValueChange={onPaymentTermsChange}
            options={(["PAID", "PARTIAL", "UNPAID"] as const).map((value) => ({
              value,
              label: paymentTermsLabels[value],
              disabled,
            }))}
          />
        </FormField>
        {paymentTerms === "PARTIAL" ? (
          <FormField label="Montant payé" error={errors.paidAmountTnd} required>
            <MoneyInput
              value={paidAmountTnd}
              onChange={onPaidAmountChange}
              disabled={disabled}
              invalid={Boolean(errors.paidAmountTnd)}
            />
          </FormField>
        ) : null}
        {remaining.greaterThan(0) || paymentTerms !== "PAID" ? (
          <FormField
            label="Échéance"
            error={errors.dueDate}
            hint="Date limite du reste à payer."
            required
          >
            <DateInput
              value={dueDate}
              onChange={onDueDateChange}
              disabled={disabled}
              invalid={Boolean(errors.dueDate)}
            />
          </FormField>
        ) : null}
      </div>
    </div>
  );
}
