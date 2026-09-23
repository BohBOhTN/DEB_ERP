import type { KitEntry } from "../../kit/types.js";
import { Badge } from "../../ui/Badge/Badge.js";
import { Accordion } from "./Accordion.js";

export const kit: KitEntry = {
  name: "Accordion",
  group: "patterns",
  description:
    "Groupes dépliables natifs pour un tableau de bord par partenaire (dépôt-vente par distributeur).",
  examples: [
    {
      title: "Dépôt-vente par distributeur",
      render: () => (
        <Accordion
          label="Dépôt-vente"
          items={[
            {
              id: "karim",
              title: "Karim Distribution",
              meta: (
                <>
                  <span>40 pièces en dépôt</span>
                  <Badge tone="warning">2 non justifiées</Badge>
                </>
              ),
              content: (
                <p>
                  Pain complet : 40 sorties, 30 vendues, 8 retournées, 2 non
                  justifiées.
                </p>
              ),
              defaultOpen: true,
            },
            {
              id: "sana",
              title: "Sana Épicerie",
              meta: <span>12 pièces en dépôt</span>,
              content: <p>Croissant : 12 sorties, 0 vendues.</p>,
            },
          ]}
        />
      ),
    },
  ],
};
