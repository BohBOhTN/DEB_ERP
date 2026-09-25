import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { formatDateTime } from "../../../i18n/format.js";
import { useSessionContext } from "../../../app/sessionContext.js";
import { useCurrentSession } from "../../pos/pos.queries.js";
import { useHealthReady } from "../settings.queries.js";
import styles from "./SettingsPage.module.css";

/// `/parametres` (UI-21, OD-V2-011): the profile as the session knows it,
/// the application identity, and the build under "À propos". The password
/// change waits for its endpoint and is hidden until then.
export function SettingsPage() {
  const { user } = useSessionContext();
  const canSeeTill = user.effectivePermissions.includes("pos.access");
  const session = useCurrentSession({ enabled: canSeeTill });
  const health = useHealthReady();

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Paramètres"
        description="Votre profil et l'identité de l'application."
      />
      <div className={styles.stack}>
        <Card>
          <CardHeader as="h2" title="Profil" />
          <KeyValueList
            items={[
              { label: "Nom affiché", value: user.displayName },
              { label: "E-mail", value: user.email },
              {
                label: "Rôles",
                value: (
                  <span className={styles.chips}>
                    {user.roles.map((role) => (
                      <Badge key={role.id} tone="neutral">
                        {role.name}
                      </Badge>
                    ))}
                  </span>
                ),
              },
              {
                label: "Session",
                value: user.sessionExpiresAt
                  ? `Expire le ${formatDateTime(user.sessionExpiresAt)}`
                  : null,
              },
            ]}
          />
          <p className={styles.muted}>
            Pour changer votre mot de passe, demandez à un Super Admin un mot de
            passe temporaire ; le changement en libre-service arrivera avec son
            point d'accès.
          </p>
        </Card>
        <Card>
          <CardHeader as="h2" title="Application" />
          <KeyValueList
            items={[
              {
                label: "Terminal de caisse",
                value:
                  session.data?.terminal.name ??
                  (canSeeTill ? "Aucune session ouverte" : null),
              },
              { label: "Emplacement principal", value: "Stock principal" },
              { label: "Devise", value: "Dinar tunisien (TND)" },
              { label: "Fuseau horaire", value: "Africa/Tunis" },
            ]}
          />
        </Card>
        <Card>
          <CardHeader as="h2" title="À propos" />
          <KeyValueList
            items={[
              {
                label: "Version",
                value:
                  health.data?.version ?? (health.isPending ? "…" : "inconnue"),
              },
              {
                label: "Révision",
                value: health.data?.gitSha ? (
                  <code>{health.data.gitSha.slice(0, 12)}</code>
                ) : null,
              },
              { label: "Environnement", value: health.data?.environment },
              {
                label: "Base de données",
                value: health.data
                  ? health.data.database.status === "ok"
                    ? `Disponible${health.data.database.migration ? ` · migration ${health.data.database.migration}` : ""}`
                    : "Indisponible"
                  : null,
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
