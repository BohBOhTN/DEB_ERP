import type { KitEntry } from "../../kit/types.js";
import { Checkbox } from "./Checkbox.js";

export const kit: KitEntry = {
  name: "Checkbox",
  group: "ui",
  description: "Case à cocher Radix avec libellé et description.",
  examples: [
    {
      title: "États",
      render: () => (
        <div style={{ display: "grid" }}>
          <Checkbox
            label="Valider immédiatement"
            description="La dépense est validée à l'enregistrement."
          />
          <Checkbox label="Coché" defaultChecked />
          <Checkbox label="Indéterminé" checked="indeterminate" />
          <Checkbox label="Désactivé" disabled />
        </div>
      ),
    },
  ],
};
