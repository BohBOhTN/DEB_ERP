import { Factory } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../Button/Button.js";
import { EmptyState } from "./EmptyState.js";

export const kit: KitEntry = {
  name: "EmptyState",
  group: "ui",
  description:
    "Le titre nomme l'objet vide, la description dit quoi faire ensuite.",
  examples: [
    {
      title: "Avec action",
      render: () => (
        <EmptyState
          icon={<Factory />}
          title="Aucun fournisseur"
          description="Ajoutez votre premier fournisseur pour enregistrer un achat."
          action={<Button>Ajouter un fournisseur</Button>}
        />
      ),
    },
    {
      title: "Compacte (résultat de filtre)",
      render: () => (
        <EmptyState
          size="sm"
          title="Aucun résultat"
          description="Modifiez la recherche ou les filtres pour afficher des éléments."
        />
      ),
    },
  ],
};
