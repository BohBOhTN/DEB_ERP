import type { KitEntry } from "../../kit/types.js";
import { TotalsCard } from "./TotalsCard.js";

export const kit: KitEntry = {
  name: "TotalsCard",
  group: "patterns",
  description: "Sous-total, payé, reste à payer et total en grand.",
  examples: [
    {
      title: "Vente partielle",
      render: () => (
        <div style={{ maxWidth: 360 }}>
          <TotalsCard
            subtotalTnd="125"
            paidTnd="100"
            remainingTnd="25"
            totalTnd="125"
          />
        </div>
      ),
    },
    {
      title: "Panier provisoire",
      render: () => (
        <div style={{ maxWidth: 360 }}>
          <TotalsCard totalTnd="14.7" provisional />
        </div>
      ),
    },
  ],
};
