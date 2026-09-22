import { Receipt, ShoppingCart, Store } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { Badge } from "../../ui/Badge/Badge.js";
import { Timeline } from "./Timeline.js";

const now = Date.now();

export const kit: KitEntry = {
  name: "Timeline",
  group: "patterns",
  description:
    "Journal d'événements : icône, titre, acteur, heure relative ou absolue.",
  examples: [
    {
      title: "Activité récente",
      render: () => (
        <div style={{ maxWidth: 480 }}>
          <Timeline
            title="Activité récente"
            timeFormat="relative"
            events={[
              {
                id: "1",
                at: new Date(now - 3 * 60_000),
                actor: "Amine",
                title: "Vente en caisse",
                description: "VT-000128 · 12,500 TND",
                icon: <Receipt />,
                href: "#",
              },
              {
                id: "2",
                at: new Date(now - 45 * 60_000),
                actor: "Salma",
                title: "Validation d'un achat",
                description: "AC-000012 · Minoterie du Sud",
                icon: <ShoppingCart />,
                badge: <Badge tone="success">Validé</Badge>,
              },
              {
                id: "3",
                at: new Date(now - 4 * 3_600_000),
                actor: "Amine",
                title: "Ouverture de caisse",
                icon: <Store />,
              },
            ]}
          />
        </div>
      ),
    },
  ],
};
