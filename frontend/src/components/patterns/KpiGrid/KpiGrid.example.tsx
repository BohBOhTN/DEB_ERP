import type { KitEntry } from "../../kit/types.js";
import { KpiTile } from "../KpiTile/KpiTile.js";
import { KpiGrid } from "./KpiGrid.js";

export const kit: KitEntry = {
  name: "KpiGrid",
  group: "patterns",
  description: "Grille 4-up sur grand écran, 2-up sur tablette et téléphone.",
  examples: [
    {
      title: "4-up",
      render: () => (
        <KpiGrid>
          <KpiTile
            featured
            label="Ventes du jour"
            value="1 250,000"
            unit="TND"
          />
          <KpiTile label="Encaissé" value="980,000" unit="TND" />
          <KpiTile label="À encaisser" value="2 340,500" unit="TND" />
          <KpiTile label="À payer" value="5 120,000" unit="TND" />
        </KpiGrid>
      ),
    },
  ],
};
