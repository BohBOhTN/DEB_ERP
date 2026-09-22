import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { IconButton } from "./IconButton.js";

export const kit: KitEntry = {
  name: "IconButton",
  group: "ui",
  description:
    "Bouton icône avec libellé accessible obligatoire ; 40 ou 44 px.",
  examples: [
    {
      title: "Variantes",
      render: () => (
        <div style={{ display: "flex", gap: 12 }}>
          <IconButton label="Modifier" icon={<Pencil />} />
          <IconButton label="Ajouter" icon={<Plus />} variant="primary" />
          <IconButton label="Fermer" icon={<X />} variant="secondary" />
          <IconButton label="Supprimer" icon={<Trash2 />} variant="danger" />
          <IconButton label="Modifier" icon={<Pencil />} size="sm" />
          <IconButton label="Chargement" icon={<Pencil />} loading />
        </div>
      ),
    },
  ],
};
