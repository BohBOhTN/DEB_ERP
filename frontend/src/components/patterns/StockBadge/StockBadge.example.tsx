import type { KitEntry } from "../../kit/types.js";
import { StockBadge } from "./StockBadge.js";

export const kit: KitEntry = {
  name: "StockBadge",
  group: "patterns",
  description: "Quantité en stock ; alerte sous le seuil, danger si négatif.",
  examples: [
    {
      title: "Niveaux",
      render: () => (
        <div style={{ display: "flex", gap: 8 }}>
          <StockBadge quantity="120" unit="pièce" lowThreshold="20" />
          <StockBadge quantity="4.5" unit="kg" lowThreshold="5" />
          <StockBadge quantity="-2.5" unit="kg" />
        </div>
      ),
    },
  ],
};
