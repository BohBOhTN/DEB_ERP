import type { KitEntry } from "../../kit/types.js";
import { Spinner } from "./Spinner.js";

export const kit: KitEntry = {
  name: "Spinner",
  group: "ui",
  description: "Indicateur d'activité ; hérite de la couleur du texte.",
  examples: [
    {
      title: "Tailles",
      render: () => (
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Spinner size={16} label="Chargement" />
          <Spinner />
          <Spinner size={32} />
        </div>
      ),
    },
  ],
};
