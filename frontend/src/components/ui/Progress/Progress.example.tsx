import type { KitEntry } from "../../kit/types.js";
import { Progress } from "./Progress.js";

export const kit: KitEntry = {
  name: "Progress",
  group: "ui",
  description:
    "Barre de progression déterminée ou indéterminée (actualisation en arrière-plan).",
  examples: [
    {
      title: "Valeurs",
      render: () => (
        <div style={{ display: "grid", gap: 12 }}>
          <Progress value={35} label="Objectif du jour" />
          <Progress value={80} label="Objectif" tone="accent" />
          <Progress value={100} label="Terminé" tone="success" size="sm" />
          <Progress label="Actualisation" size="sm" />
        </div>
      ),
    },
  ],
};
