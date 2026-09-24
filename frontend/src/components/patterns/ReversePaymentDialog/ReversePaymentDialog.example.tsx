import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../../ui/Button/Button.js";
import { ReversePaymentDialog } from "./ReversePaymentDialog.js";

function Example() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Annuler le règlement
      </Button>
      <ReversePaymentDialog
        open={open}
        kind="reglement"
        partyName="Amel Trabelsi"
        amountTnd="20.000"
        paidAt="2026-09-24T09:00:00.000Z"
        documents={["VT-000012"]}
        collectedAtTill
        onPost={async (_key, submitted) => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          setReason(submitted);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
      <p style={{ fontSize: 14 }}>Motif envoyé : {reason ?? "aucun"}</p>
    </div>
  );
}

export const kit: KitEntry = {
  name: "ReversePaymentDialog",
  group: "patterns",
  description:
    "Annulation d'un règlement ou d'un paiement : motif obligatoire, documents rétablis, sortie de caisse annoncée.",
  examples: [{ title: "Règlement client", render: () => <Example /> }],
};
