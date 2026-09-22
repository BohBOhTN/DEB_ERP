import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../Button/Button.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

function Example({
  danger = false,
  requireReason = false,
}: {
  danger?: boolean;
  requireReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button
        variant={danger ? "danger" : "primary"}
        onClick={() => setOpen(true)}
      >
        {danger ? "Annuler l'achat" : "Valider l'achat"}
      </Button>
      <ConfirmDialog
        open={open}
        title={
          danger ? "Annuler l'achat AC-000012" : "Valider l'achat AC-000012"
        }
        tone={danger ? "danger" : "default"}
        requireReason={requireReason}
        loading={loading}
        confirmLabel={danger ? "Annuler l'achat" : "Valider l'achat"}
        impact={
          <ul>
            <li>
              Le stock de farine T55 {danger ? "diminue" : "augmente"} de 50 kg.
            </li>
            <li>
              Le solde dû au fournisseur {danger ? "diminue" : "augmente"} de
              125,000 TND.
            </li>
            <li>L'achat passe à l'état {danger ? "Annulé" : "Validé"}.</li>
          </ul>
        }
        onConfirm={() => {
          setLoading(true);
          setTimeout(() => {
            setLoading(false);
            setOpen(false);
          }, 1200);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export const kit: KitEntry = {
  name: "ConfirmDialog",
  group: "ui",
  description:
    "Confirmation avec bloc de conséquences obligatoire, motif facultatif, chargement bloquant.",
  examples: [
    {
      title: "Validation et annulation",
      render: () => (
        <div style={{ display: "flex", gap: 12 }}>
          <Example />
          <Example danger requireReason />
        </div>
      ),
    },
  ],
};
