import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState.js";
import { fr } from "../../i18n/fr.js";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Page introuvable"
      description="L'adresse demandée n'existe pas ou a changé."
      action={<Link to="/">{fr.goHome}</Link>}
    />
  );
}
