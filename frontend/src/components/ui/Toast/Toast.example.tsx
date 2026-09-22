import type { KitEntry } from "../../kit/types.js";
import { Button } from "../Button/Button.js";
import { useToast } from "./useToast.js";

function Example() {
  const toast = useToast();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <Button
        variant="secondary"
        onClick={() =>
          toast.success("Achat validé", "AC-000012 est passé à l'état Validé.")
        }
      >
        Succès
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.error(
            "Une erreur est survenue",
            "Réessayez. Si le problème persiste, contactez le responsable.",
          )
        }
      >
        Erreur (persistante)
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.warning(
            "Session bientôt expirée",
            "La session expire dans 10 minutes.",
          )
        }
      >
        Avertissement
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast.toast({
            kind: "info",
            title: "Commande prête",
            description: "La commande de Salma Ben Ali peut être livrée.",
            action: { label: "Ouvrir", onClick: () => undefined },
          })
        }
      >
        Info avec action
      </Button>
    </div>
  );
}

export const kit: KitEntry = {
  name: "Toast",
  group: "ui",
  description:
    "Quatre types, trois visibles au plus, 5 s ; les erreurs restent jusqu'à fermeture.",
  examples: [{ title: "Déclencher", render: () => <Example /> }],
};
