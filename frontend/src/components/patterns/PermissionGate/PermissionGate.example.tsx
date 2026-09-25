import type { KitEntry } from "../../kit/types.js";
import { toPermissionSet } from "../../../lib/auth/permissions.js";
import { Button } from "../../ui/Button/Button.js";
import { PermissionGate } from "./PermissionGate.js";

const cashier = toPermissionSet(["pos.access", "pos.sell"]);

export const kit: KitEntry = {
  name: "PermissionGate",
  group: "patterns",
  description:
    "Masque les enfants sans l'autorisation ; jamais l'unique protection.",
  examples: [
    {
      title: "Caissier : vendre oui, valider un achat non",
      render: () => (
        <div style={{ display: "flex", gap: 12 }}>
          <PermissionGate permissions={cashier} permission="pos.sell">
            <Button>Encaisser</Button>
          </PermissionGate>
          <PermissionGate
            permissions={cashier}
            permission="purchases.post"
            fallback={<span>Bouton « Valider l'achat » masqué</span>}
          >
            <Button>Valider l'achat</Button>
          </PermissionGate>
        </div>
      ),
    },
  ],
};
