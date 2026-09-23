import { ErrorState } from "../../components/ui/ErrorState/ErrorState.js";
import { fr } from "../../i18n/fr.js";

export function AccessDeniedPage() {
  return (
    <ErrorState
      variant="denied"
      title={fr.permissionDeniedTitle}
      description={fr.permissionDeniedDescription}
    />
  );
}
