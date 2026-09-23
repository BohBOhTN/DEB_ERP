import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Shield,
} from "lucide-react";
import { useState } from "react";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { describeError } from "../../../i18n/errors.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { AccessUser } from "../access.api.js";
import { useRoles, useSetUserActivation, useUsers } from "../access.queries.js";
import { ResetPasswordDialog } from "../components/ResetPasswordDialog.js";
import { UserFormDialog } from "../components/UserFormDialog.js";
import { UserRolesDialog } from "../components/UserRolesDialog.js";
import styles from "./AccessPages.module.css";

const defaults = { q: "", isActive: "", roleId: "", page: 1, pageSize: 25 };

/// `/utilisateurs` (UI-19): the users with their roles as chips and the
/// row actions; deactivating the last Super Admin shows the server's
/// French explanation (AS-V2-22).
export function UsersPage() {
  const permissions = useSessionPermissions();
  const toast = useToast();
  const [state, setState] = useUrlState(defaults);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AccessUser | null>(null);
  const [rolesOf, setRolesOf] = useState<AccessUser | null>(null);
  const [resetting, setResetting] = useState<AccessUser | null>(null);
  const [toggling, setToggling] = useState<AccessUser | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const roles = useRoles();
  const activation = useSetUserActivation();
  const query = useUsers({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    isActive: state.isActive === "" ? undefined : state.isActive === "true",
    roleId: state.roleId || undefined,
    sort: { field: "displayName", direction: "asc" },
  });

  const columns: DataTableColumn<AccessUser>[] = [
    { id: "name", header: "Nom", accessorFn: (row) => row.displayName },
    { id: "email", header: "E-mail", accessorFn: (row) => row.email },
    {
      id: "roles",
      header: "Rôles",
      cell: ({ row }) => (
        <span className={styles.chips}>
          {row.original.roles.length === 0 ? (
            <span className={styles.muted}>Aucun rôle</span>
          ) : null}
          {row.original.roles.map((role) => (
            <Badge key={role.id} tone={role.isSystem ? "warning" : "neutral"}>
              {role.name}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        description="Qui peut se connecter, avec quels rôles."
        actions={
          <PermissionGate permissions={permissions} permission="users.create">
            <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
              Nouvel utilisateur
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher par nom ou e-mail"
        activeCount={(state.isActive ? 1 : 0) + (state.roleId ? 1 : 0)}
        onReset={() => setState({ isActive: "", roleId: "", page: 1 })}
        filters={
          <>
            <Select
              aria-label="Rôle"
              placeholder="Tous les rôles"
              clearable
              value={state.roleId || null}
              onValueChange={(value) =>
                setState({ roleId: value ?? "", page: 1 })
              }
              options={(roles.data ?? []).map((role) => ({
                value: role.id,
                label: role.name,
              }))}
            />
            <Select
              aria-label="Statut"
              placeholder="Tous les statuts"
              clearable
              value={state.isActive || null}
              onValueChange={(value) =>
                setState({ isActive: value ?? "", page: 1 })
              }
              options={[
                { value: "true", label: "Actifs" },
                { value: "false", label: "Inactifs" },
              ]}
            />
          </>
        }
      />
      <DataTable<AccessUser>
        label="Utilisateurs"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
          })
        }
        loading={query.isPending || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucun utilisateur",
          description: state.q
            ? "Modifiez la recherche."
            : "Créez un utilisateur pour donner accès à l'application.",
        }}
        getRowId={(row) => row.id}
        rowActions={(row) => {
          const items = [
            {
              id: "edit",
              label: "Modifier",
              icon: <Pencil />,
              onSelect: () => setEditing(row),
              hidden: !permissions.has("users.update"),
            },
            {
              id: "roles",
              label: "Rôles",
              icon: <Shield />,
              onSelect: () => setRolesOf(row),
              hidden: !permissions.has("users.assign_roles"),
            },
            {
              id: "reset",
              label: "Réinitialiser le mot de passe",
              icon: <KeyRound />,
              onSelect: () => setResetting(row),
              hidden: !permissions.has("users.reset_password"),
            },
            {
              id: "toggle",
              label: row.isActive ? "Désactiver" : "Réactiver",
              icon: <Power />,
              onSelect: () => setToggling(row),
              danger: row.isActive,
              hidden: !permissions.has("users.activate"),
              separatorBefore: true,
            },
          ];
          return items.every((item) => item.hidden) ? null : (
            <DropdownMenu
              label="Actions de la ligne"
              trigger={
                <IconButton
                  label="Actions"
                  icon={<MoreHorizontal />}
                  size="sm"
                />
              }
              items={items}
            />
          );
        }}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.displayName}</strong>
              <StatusPill status={row.isActive ? "ACTIVE" : "INACTIVE"} />
            </span>
            <span className={styles.muted}>{row.email}</span>
            <span className={styles.chips}>
              {row.roles.map((role) => (
                <Badge
                  key={role.id}
                  tone={role.isSystem ? "warning" : "neutral"}
                >
                  {role.name}
                </Badge>
              ))}
            </span>
          </>
        )}
      />
      <UserFormDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        user={editing}
      />
      <UserRolesDialog user={rolesOf} onClose={() => setRolesOf(null)} />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
      />
      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling?.isActive
            ? `Désactiver ${toggling.displayName}`
            : `Réactiver ${toggling?.displayName ?? ""}`
        }
        tone={toggling?.isActive ? "danger" : "default"}
        confirmLabel={toggling?.isActive ? "Désactiver" : "Réactiver"}
        loading={activation.isPending}
        impact={
          <div>
            {toggling?.isActive ? (
              <p>
                L'utilisateur ne pourra plus se connecter ; son historique est
                conservé. Le dernier Super Admin actif ne peut pas être
                désactivé.
              </p>
            ) : (
              <p>
                L'utilisateur pourra de nouveau se connecter avec ses rôles.
              </p>
            )}
            {blocked ? <p role="alert">{blocked}</p> : null}
          </div>
        }
        onConfirm={() => {
          if (!toggling) return;
          setBlocked(null);
          activation.mutate(
            { userId: toggling.id, isActive: !toggling.isActive },
            {
              onSuccess: (user) => {
                toast.success(
                  user.isActive
                    ? "Utilisateur réactivé"
                    : "Utilisateur désactivé",
                  user.displayName,
                );
                setToggling(null);
              },
              onError: (error) => setBlocked(describeError(error).description),
            },
          );
        }}
        onCancel={() => {
          setToggling(null);
          setBlocked(null);
        }}
      />
    </>
  );
}
