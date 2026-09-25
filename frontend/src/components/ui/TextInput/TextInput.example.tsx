import { Search } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { TextInput } from "./TextInput.js";

export const kit: KitEntry = {
  name: "TextInput",
  group: "ui",
  description:
    "Champ texte 44 px, préfixe et suffixe, états invalide et désactivé.",
  examples: [
    {
      title: "Variantes",
      render: () => (
        <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
          <TextInput
            aria-label="Recherche"
            placeholder="Rechercher un produit"
            prefix={<Search />}
          />
          <TextInput
            aria-label="Prix"
            defaultValue="12,500"
            suffix="TND"
            align="right"
          />
          <TextInput
            aria-label="Invalide"
            invalid
            defaultValue="valeur incorrecte"
          />
          <TextInput aria-label="Désactivé" disabled defaultValue="Désactivé" />
        </div>
      ),
    },
  ],
};
