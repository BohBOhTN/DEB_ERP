import { ConfirmPostingDialog } from "../ConfirmPostingDialog/ConfirmPostingDialog.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";

export interface ReversePaymentDialogProps {
  open: boolean;
  /// "Annuler le règlement" for money received, "Annuler le paiement" for
  /// money paid; the dialog title and confirm label follow.
  kind: "reglement" | "paiement";
  partyName: string;
  amountTnd: string;
  paidAt: string;
  /// Documents the payment had settled, restored by the reversal.
  documents: string[];
  /// True when the money went through the till: the reversal takes the cash
  /// out of the drawer that is open now.
  collectedAtTill?: boolean;
  onPost: (idempotencyKey: string, reason: string) => Promise<void>;
  onClose: () => void;
}

/// Reversal of a customer, supplier or distributor payment: the payment row
/// stays visible as annulé, compensating ledger entries give the amount back
/// to the documents it had settled, and a reason is mandatory (rule 04
/// section 12: correct through reversal, never delete).
export function ReversePaymentDialog({
  open,
  kind,
  partyName,
  amountTnd,
  paidAt,
  documents,
  collectedAtTill = false,
  onPost,
  onClose,
}: ReversePaymentDialogProps) {
  const noun = kind === "reglement" ? "règlement" : "paiement";

  return (
    <ConfirmPostingDialog
      open={open}
      title={`Annuler le ${noun}`}
      tone="danger"
      confirmLabel={`Annuler le ${noun}`}
      requireReason
      impact={
        <ul>
          <li>
            {kind === "reglement" ? "Règlement" : "Paiement"} de {partyName} du{" "}
            {formatDate(paidAt)} : {formatMoney(amountTnd)}.
          </li>
          <li>
            {documents.length > 0
              ? `Le reste dû de ${documents.join(", ")} est rétabli.`
              : `Le solde de ${partyName} est rétabli.`}
          </li>
          {collectedAtTill ? (
            <li>
              Le montant sort de la caisse ouverte ; une session de caisse doit
              être ouverte.
            </li>
          ) : null}
          <li>
            Le {noun} reste consultable avec son motif, l'auteur et l'heure de
            l'annulation.
          </li>
        </ul>
      }
      onPost={(key, reason) => onPost(key, reason ?? "")}
      onCancel={onClose}
    />
  );
}
