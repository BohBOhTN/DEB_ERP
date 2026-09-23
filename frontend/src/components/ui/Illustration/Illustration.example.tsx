import type { KitEntry } from "../../kit/types.js";
import { EmptyState } from "../EmptyState/EmptyState.js";
import { Illustration } from "./Illustration.js";

export const kit: KitEntry = {
  name: "Illustration",
  group: "ui",
  description:
    "Quatre dessins au trait aux couleurs de la marque pour les états vides et la page introuvable ; décoratifs, le texte porte le sens.",
  examples: [
    {
      title: "Les quatre dessins",
      render: () => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <Illustration name="shelf" size={96} />
          <Illustration name="ledger" size={96} />
          <Illustration name="basket" size={96} />
          <Illustration name="compass" size={96} />
        </div>
      ),
    },
    {
      title: "Dans un état vide",
      render: () => (
        <EmptyState
          illustration="basket"
          title="Aucune vente aujourd'hui"
          description="Les ventes encaissées apparaîtront ici."
        />
      ),
    },
  ],
};
