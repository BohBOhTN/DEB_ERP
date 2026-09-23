import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { cx } from "../../../lib/cx.js";
import { describeError } from "../../../i18n/errors.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { usePermissionCatalogue, useRoles } from "../access.queries.js";
import { RoleEditor } from "../components/RoleEditor.js";
import { RoleFormDialog } from "../components/RoleFormDialog.js";
import styles from "./AccessPages.module.css";

/// `/roles` and `/roles/:roleId` (UI-19): the role list on the left and the
/// editor on the right on desktop; on a phone the list, then the editor as
/// its own page.
export function RolesPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const { roleId = "" } = useParams();
  const roles = useRoles();
  const catalogue = usePermissionCatalogue();
  const [creating, setCreating] = useState(false);
  const selected =
    roles.data?.find((role) => role.id === roleId) ??
    (phone ? undefined : roles.data?.[0]);

  if (roles.isError || catalogue.isError) {
    const copy = describeError(roles.error ?? catalogue.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void Promise.all([roles.refetch(), catalogue.refetch()])}
      />
    );
  }

  if (!roles.data || !catalogue.data) {
    return <Skeleton variant="table" rows={6} />;
  }

  const list = (
    <ul className={styles.roleList} aria-label="Rôles">
      {roles.data.map((role) => (
        <li key={role.id}>
          <button
            type="button"
            className={cx(
              styles.roleItem,
              selected?.id === role.id && styles.active,
            )}
            aria-current={selected?.id === role.id ? "true" : undefined}
            onClick={() => navigate(`/roles/${role.id}`)}
          >
            <span className={styles.roleName}>
              {role.name}
              {role.isSystem ? <Badge tone="warning">Protégé</Badge> : null}
              {!role.isActive ? <Badge tone="neutral">Inactif</Badge> : null}
            </span>
            <span className={styles.muted}>
              {role.userCount ?? 0} utilisateur
              {(role.userCount ?? 0) > 1 ? "s" : ""} · {role.permissionCount}{" "}
              autorisation{role.permissionCount > 1 ? "s" : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const editor = selected ? (
    <Card>
      <CardHeader
        as="h2"
        title={selected.name}
        description={selected.description ?? undefined}
      />
      <RoleEditor
        role={selected}
        groups={catalogue.data.groups}
        permissions={permissions}
      />
    </Card>
  ) : (
    <EmptyState
      title="Choisissez un rôle"
      description="Sélectionnez un rôle pour voir ou modifier ses autorisations."
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Rôles et autorisations"
        description="Chaque rôle regroupe des autorisations, décrites en français par module."
        breadcrumbs={
          phone && selected
            ? [{ label: "Rôles", href: "/roles" }, { label: selected.name }]
            : undefined
        }
        actions={
          <PermissionGate permissions={permissions} permission="roles.create">
            <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
              Nouveau rôle
            </Button>
          </PermissionGate>
        }
      />
      {phone ? (
        roleId ? (
          editor
        ) : (
          list
        )
      ) : (
        <div className={styles.split}>
          {list}
          {editor}
        </div>
      )}
      <RoleFormDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(role) => navigate(`/roles/${role.id}`)}
      />
    </>
  );
}
