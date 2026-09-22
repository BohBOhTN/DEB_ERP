import { Clock } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { Badge } from "./Badge.js";

export const kit: KitEntry = {
  name: "Badge",
  group: "ui",
  description:
    "Six tonalités ; fond doux et texte fort ; jamais la couleur seule.",
  examples: [
    {
      title: "Tonalités",
      render: () => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Badge>Neutre</Badge>
          <Badge tone="success">Validé</Badge>
          <Badge tone="warning" icon={<Clock />}>
            En attente
          </Badge>
          <Badge tone="danger">Annulé</Badge>
          <Badge tone="info">Information</Badge>
          <Badge tone="accent">Nouveau</Badge>
        </div>
      ),
    },
  ],
};
