import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import type { Sale } from "../pos.api.js";
import { useCancelSale } from "../pos.queries.js";

export interface CancelSaleDialogProps {
  open: boolean;
  sale: Sale;
  onCancelled: (sale: Sale) => void;
  onClose: () => void;
}

/// "Annuler la vente" (issue #44, DEC-V2-003): the sale stays visible as
/// annulée with its reason; the stock comes back, the customer's balance
/// drops by what remained due, and the cash taken leaves the open drawer.
export function CancelSaleDialog({
  open,
  sale,
  onCancelled,
  onClose,
}: CancelSaleDialogProps) {
  const cancel = useCancelSale();
  const cash = (sale.payments ?? [])
    .filter((payment) => payment.movement !== "REFUND")
    .reduce((sum, payment) => sum + Number(payment.amountTnd), 0);
  const remaining = Number(sale.remainingDueTnd);

  return (
    <ConfirmPostingDialog
      open={open}
      title={`Annuler ${sale.reference}`}
      tone="danger"
      confirmLabel="Annuler la vente"
      requireReason
      impact={
        <ul>
          {(sale.lines ?? []).length > 0 ? (
            <li>
              Stock :{" "}
              {(sale.lines ?? [])
                .map(
                  (line) =>
                    `+${formatQuantity(line.quantity, line.unitNameSnapshot)} ${line.productNameSnapshot}`,
                )
                .join(", ")}
              .
            </li>
          ) : null}
          {sale.customer && remaining > 0 ? (
            <li>
              Solde de {sale.customer.name} : −
              {formatMoney(sale.remainingDueTnd)}.
            </li>
          ) : null}
          {cash > 0 ? (
            <li>
              Caisse : −{formatMoney(cash.toFixed(3))} remboursés depuis la
              session ouverte ; une session doit être ouverte.
            </li>
          ) : null}
          <li>
            La vente reste consultable avec son motif, l'auteur et l'heure de
            l'annulation.
          </li>
        </ul>
      }
      onPost={async (idempotencyKey, reason) => {
        const cancelled = await cancel.mutateAsync({
          saleId: sale.id,
          reason: reason ?? "",
          idempotencyKey,
        });
        onCancelled(cancelled);
      }}
      onCancel={onClose}
    />
  );
}
