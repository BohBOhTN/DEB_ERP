import type { KitEntry } from "../../kit/types.js";
import { Sparkline } from "./Sparkline.js";

const values = Array.from(
  { length: 30 },
  (_, index) =>
    20 + Math.round(Math.abs(Math.sin(index / 3)) * 60 + (index % 5) * 4),
);

export const kit: KitEntry = {
  name: "Sparkline",
  group: "patterns",
  description: "Tendance sur 30 jours, SVG accessible.",
  examples: [
    {
      title: "Tonalités",
      render: () => (
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Sparkline
            title="Dépenses des 30 derniers jours"
            values={values}
            summary="1 250 TND au total"
          />
          <Sparkline
            title="Ventes"
            values={values}
            tone="accent"
            width={200}
            height={48}
          />
        </div>
      ),
    },
  ],
};
