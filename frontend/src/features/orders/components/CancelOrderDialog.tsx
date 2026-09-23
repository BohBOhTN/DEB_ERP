import { useState } from "react";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { formatMoney } from "../../../i18n/format.js";
import type { AdvanceDisposition, Order } from "../orders.api.js";
import { useCancelOrder } from "../orders.queries.js";

export interface CancelOrderDialogProps {
  open: boolean;
  order: Order;
  onCancelled: (order: Order) => void;
  onClose: () => void;
}

/// "Annuler" (ORD-013, ORD-018, AS-012): a reason is mandatory and, when an
/// advance exists, the money is refunded or kept as customer credit, chosen
/// explicitly; it never disappears.
export function CancelOrderDialog({
  open,
  order,
  onCancelled,
  onClose,
}: CancelOrderDialogProps) {
  const cancel = useCancelOrder();
  const [disposition, setDisposition] =
    useState<AdvanceDisposition>("REFUNDED");
  const hasAdvance = Number(order.advanceBalanceTnd) > 0;

  return (
    <ConfirmPostingDialog
      open={open}
      title={`Annuler ${order.reference}`}
      tone="danger"
      confirmLabel="Annuler la commande"
      requireReason
      impact={
        <div>
          <ul>
            <li>
              La commande reste consultable avec son motif, l'auteur et l'heure
              de l'annulation.
            </li>
            <li>
              Aucun stock ni chiffre d'affaires n'est touché : rien n'avait été
              remis.
            </li>
            {hasAdvance ? (
              <li>
                Acompte de {formatMoney(order.advanceBalanceTnd)} :{" "}
                {disposition === "REFUNDED"
                  ? "remboursé en espèces depuis la caisse ouverte."
                  : "conservé comme avoir du client."}
              </li>
            ) : null}
          </ul>
          {hasAdvance ? (
            <FormField
              label="Sort de l'acompte"
              labelIsElement={false}
              required
            >
              <SegmentedControl<AdvanceDisposition>
                label="Sort de l'acompte"
                fullWidth
                value={disposition}
                onValueChange={setDisposition}
                options={[
                  { value: "REFUNDED", label: "Rembourser" },
                  { value: "CREDITED", label: "Conserver en avoir" },
                ]}
              />
            </FormField>
          ) : null}
        </div>
      }
      onPost={async (idempotencyKey, reason) => {
        const cancelled = await cancel.mutateAsync({
          orderId: order.id,
          body: {
            cancelledAt: new Date().toISOString(),
            reason: reason ?? "",
            ...(hasAdvance ? { advanceDisposition: disposition } : {}),
          },
          idempotencyKey,
        });
        onCancelled(cancelled);
      }}
      onCancel={onClose}
    />
  );
}
