import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { safeDecimal } from "../distribution.schemas.js";

export interface SettlementTotalsCardProps {
  soldTnd: string;
  paidAmountTnd: string;
  onPaidAmountChange: (amount: string) => void;
  error?: string;
  disabled?: boolean;
}

/// Montant vendu, payé maintenant and reste dû (DST-017): the remainder
/// becomes distributor receivable.
export function SettlementTotalsCard({
  soldTnd,
  paidAmountTnd,
  onPaidAmountChange,
  error,
  disabled,
}: SettlementTotalsCardProps) {
  const paid = safeDecimal(paidAmountTnd);
  const remaining = safeDecimal(soldTnd).minus(paid);
  return (
    <div>
      <TotalsCard
        totalTnd={soldTnd}
        paidTnd={paid.toFixed(3)}
        remainingTnd={remaining.greaterThan(0) ? remaining.toFixed(3) : "0"}
        provisional
      />
      <PaymentBox
        dueTnd={soldTnd}
        amountTnd={paidAmountTnd}
        onAmountChange={onPaidAmountChange}
        error={error}
        disabled={disabled}
      />
    </div>
  );
}
