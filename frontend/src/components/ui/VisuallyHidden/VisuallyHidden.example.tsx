import type { KitEntry } from "../../kit/types.js";
import { VisuallyHidden } from "./VisuallyHidden.js";

export const kit: KitEntry = {
  name: "VisuallyHidden",
  group: "ui",
  description: "Texte réservé aux lecteurs d'écran.",
  examples: [
    {
      title: "Libellé masqué",
      render: () => (
        <p>
          Le bouton suivant a un libellé invisible :{" "}
          <VisuallyHidden>Fermer</VisuallyHidden>
          <span aria-hidden="true">×</span>
        </p>
      ),
    },
  ],
};
