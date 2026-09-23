import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import type { Purchase } from "../procurement.api.js";
import { usePostPurchase } from "../procurement.queries.js";
import { unitSymbolOf } from "./procurementLabels.js";

export interface PostPurchaseDialogProps {
  open: boolean;
  purchase: Purchase | null;
  onPosted: (purchase: Purchase) => void;
  onCancel: () => void;
}

/// Posting confirmation (07 section 4.3): the impact lists the stock added
/// per material in base units, the payable created and the payment recorded
/// at posting; the command carries one idempotency key per intent.
export function PostPurchaseDialog({
  open,
  purchase,
  onPosted,
  onCancel,
}: PostPurchaseDialogProps) {
  const post = usePostPurchase();

  if (!purchase) {
    return null;
  }

  const remaining = Number(purchase.totalTnd) - Number(purchase.paidAmountTnd);
  const stockLines = purchase.lines
    .map(
      (line) =>
        `+${formatQuantity(line.normalizedQuantity, unitSymbolOf(line.baseUnitNameSnapshot))} ${line.rawMaterialNameSnapshot}`,
    )
    .join(", ");

  return (
    <ConfirmPostingDialog
      open={open}
      title={`Valider l'achat${purchase.reference ? ` ${purchase.reference}` : ""}`}
      confirmLabel={fr.post}
      impact={
        <ul>
          <li>Stock : {stockLines}.</li>
          <li>
            Dette fournisseur {purchase.supplier.name} :{" "}
            {remaining > 0 ? `+${formatMoney(remaining.toFixed(3))}` : "aucune"}
            {purchase.dueDate && remaining > 0
              ? `, échéance ${new Date(purchase.dueDate).toLocaleDateString("fr-TN")}`
              : ""}
            .
          </li>
          {Number(purchase.paidAmountTnd) > 0 ? (
            <li>
              Paiement enregistré : {formatMoney(purchase.paidAmountTnd)}.
            </li>
          ) : null}
          <li>
            L'achat reçoit une référence et ne pourra plus être modifié,
            seulement annulé avec un motif.
          </li>
        </ul>
      }
      onPost={async (idempotencyKey) => {
        const result = await post.mutateAsync({
          purchaseId: purchase.id,
          idempotencyKey,
        });
        onPosted(result);
      }}
      onCancel={onCancel}
    />
  );
}
