import { useState } from "react";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import type { Order } from "../orders.api.js";
import { useCompleteOrder } from "../orders.queries.js";
import { safeDecimal } from "../orders.schemas.js";
import { remainingOf } from "./orderLabels.js";

export interface CompleteOrderDialogProps {
  open: boolean;
  order: Order;
  onCompleted: (order: Order) => void;
  onCancel: () => void;
}

/// "Terminer" (ORD-010, ORD-011, AS-010): one linked sale, stock down for
/// stockable products, the advance applied, the remainder paid now or left
/// as receivable, revenue recognised once.
export function CompleteOrderDialog({
  open,
  order,
  onCompleted,
  onCancel,
}: CompleteOrderDialogProps) {
  const complete = useCompleteOrder();
  const [paidAmountTnd, setPaidAmountTnd] = useState("");
  const remaining = safeDecimal(remainingOf(order));
  const paid = safeDecimal(paidAmountTnd);
  const receivable = remaining.minus(paid);
  const overpaid = receivable.lessThan(0);

  return (
    <ConfirmPostingDialog
      open={open}
      title={`Terminer ${order.reference}`}
      confirmLabel="Terminer la commande"
      impact={
        <div>
          <PaymentBox
            dueTnd={remaining.toFixed(3)}
            amountTnd={paidAmountTnd}
            onAmountChange={setPaidAmountTnd}
          />
          <ul>
            <li>
              Stock :{" "}
              {(order.lines ?? [])
                .map(
                  (line) =>
                    `−${formatQuantity(line.quantity, line.unitNameSnapshot)} ${line.productNameSnapshot}`,
                )
                .join(", ")}
              .
            </li>
            {Number(order.advanceBalanceTnd) > 0 ? (
              <li>
                Acompte appliqué : {formatMoney(order.advanceBalanceTnd)}.
              </li>
            ) : null}
            <li>Encaissé maintenant : {formatMoney(paid.toFixed(3))}.</li>
            <li>
              {receivable.greaterThan(0)
                ? `Reste à payer porté au compte client : ${formatMoney(receivable.toFixed(3))}.`
                : overpaid
                  ? "Le montant dépasse le reste dû."
                  : "Rien ne reste dû."}
            </li>
            <li>
              Chiffre d'affaires reconnu : {formatMoney(order.totalTnd)}, une
              seule fois, sur la vente liée.
            </li>
          </ul>
        </div>
      }
      onPost={async (idempotencyKey) => {
        if (overpaid) {
          throw new Error("Le montant dépasse le reste dû.");
        }
        // Always stated: "0.000" leaves the remainder on the customer's
        // account, it is never read as "paid in full" (issue #45).
        const completed = await complete.mutateAsync({
          orderId: order.id,
          body: {
            completedAt: new Date().toISOString(),
            paidAmountTnd: paid.toFixed(3),
          },
          idempotencyKey,
        });
        onCompleted(completed);
      }}
      onCancel={() => {
        setPaidAmountTnd("");
        onCancel();
      }}
    />
  );
}
