import { Plus, Save } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "./Button.js";

const row = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "center",
} as const;

export const kit: KitEntry = {
  name: "Button",
  group: "ui",
  description: "Variantes, tailles, icônes, chargement et pleine largeur.",
  examples: [
    {
      title: "Variantes",
      render: () => (
        <div style={row}>
          <Button>Enregistrer</Button>
          <Button variant="secondary">Annuler</Button>
          <Button variant="ghost">Voir le détail</Button>
          <Button variant="danger">Annuler l'achat</Button>
          <Button variant="link">Réinitialiser</Button>
        </div>
      ),
    },
    {
      title: "Tailles et icônes",
      render: () => (
        <div style={row}>
          <Button size="sm" leftIcon={<Plus />}>
            Ajouter
          </Button>
          <Button leftIcon={<Save />}>Enregistrer</Button>
          <Button size="lg" rightIcon={<Plus />}>
            Nouvelle vente
          </Button>
        </div>
      ),
    },
    {
      title: "États",
      render: () => (
        <div style={row}>
          <Button loading>Enregistrer</Button>
          <Button disabled>Désactivé</Button>
          <Button variant="secondary" loading>
            Chargement
          </Button>
        </div>
      ),
    },
    {
      title: "Pleine largeur",
      render: () => <Button fullWidth>Se connecter</Button>,
    },
  ],
};
