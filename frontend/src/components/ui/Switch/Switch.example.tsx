import type { KitEntry } from "../../kit/types.js";
import { Switch } from "./Switch.js";

export const kit: KitEntry = {
  name: "Switch",
  group: "ui",
  description: "Interrupteur Radix avec libellé à gauche.",
  examples: [
    {
      title: "États",
      render: () => (
        <div style={{ display: "grid", maxWidth: 420 }}>
          <Switch
            label="Encaissé à la caisse"
            description="Le règlement entre dans la session ouverte."
          />
          <Switch label="Actif" defaultChecked />
          <Switch label="Désactivé" disabled />
        </div>
      ),
    },
  ],
};
