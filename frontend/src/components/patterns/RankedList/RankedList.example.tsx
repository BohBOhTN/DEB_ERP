import type { KitEntry } from "../../kit/types.js";
import { RankedList } from "./RankedList.js";

export const kit: KitEntry = {
  name: "RankedList",
  group: "patterns",
  description: "Classement avec puce de rang, valeur et barre relative.",
  examples: [
    {
      title: "Produits les plus vendus",
      render: () => (
        <div style={{ maxWidth: 420 }}>
          <RankedList
            title="Produits les plus vendus"
            items={[
              { label: "Baguette", value: 320, formatted: "320 pièces" },
              { label: "Pain complet", value: 210, formatted: "210 pièces" },
              { label: "Croissant", value: 140, formatted: "140 pièces" },
              { label: "Mille-feuille", value: 60, formatted: "60 pièces" },
            ]}
          />
        </div>
      ),
    },
  ],
};
