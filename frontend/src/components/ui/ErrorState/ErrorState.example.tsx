import type { KitEntry } from "../../kit/types.js";
import { ErrorState } from "./ErrorState.js";

export const kit: KitEntry = {
  name: "ErrorState",
  group: "ui",
  description:
    "Erreur serveur avec réessai et identifiant de support ; accès refusé ; réseau.",
  examples: [
    {
      title: "Erreur serveur",
      render: () => (
        <ErrorState
          title="Une erreur est survenue"
          description="Réessayez. Si le problème persiste, contactez le responsable."
          onRetry={() => undefined}
          correlationId="7f3a9c2e-1b4d-4e8f-9a6b-2c5d8e1f3a7b"
        />
      ),
    },
    {
      title: "Accès refusé",
      render: () => (
        <ErrorState
          variant="denied"
          title="Accès refusé"
          description="Vous n'avez pas l'autorisation d'effectuer cette action."
        />
      ),
    },
    {
      title: "Réseau",
      render: () => (
        <ErrorState
          variant="network"
          title="Connexion impossible"
          description="Vérifiez la connexion réseau puis réessayez."
          onRetry={() => undefined}
        />
      ),
    },
  ],
};
