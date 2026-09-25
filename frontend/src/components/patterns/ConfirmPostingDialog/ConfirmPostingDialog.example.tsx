import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { ApiError } from "../../../lib/api/errors.js";
import { Button } from "../../ui/Button/Button.js";
import { ConfirmPostingDialog } from "./ConfirmPostingDialog.js";

function Example() {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [keys, setKeys] = useState<string[]>([]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Button onClick={() => setOpen(true)}>Encaisser la vente</Button>
      <ConfirmPostingDialog
        open={open}
        title="Encaisser la vente"
        confirmLabel="Encaisser"
        impact={
          <ul>
            <li>Le stock des produits vendus diminue.</li>
            <li>La session de caisse encaisse 14,700 TND.</li>
          </ul>
        }
        onPost={async (key) => {
          setKeys((current) => [...current, key]);
          setAttempt((current) => current + 1);
          await new Promise((resolve) => setTimeout(resolve, 700));
          if (attempt === 0) {
            throw new ApiError({
              code: "NETWORK_ERROR",
              message: "",
              status: 0,
            });
          }
        }}
        onPosted={() => {
          setOpen(false);
          setAttempt(0);
        }}
        onCancel={() => setOpen(false)}
      />
      <p style={{ fontSize: 14 }}>
        Clés envoyées : {keys.length === 0 ? "aucune" : keys.join(", ")}
        <br />
        La première tentative simule une panne réseau ; la seconde renvoie la
        même clé.
      </p>
    </div>
  );
}

export const kit: KitEntry = {
  name: "ConfirmPostingDialog",
  group: "patterns",
  description:
    "Confirmation d'une commande de validation ; clé d'idempotence générée une fois, réutilisée à la relance.",
  examples: [{ title: "Vente", render: () => <Example /> }],
};
