import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ApiError, CurrentUser } from "../auth/authApi";
import {
  createRole,
  createUser,
  getAccessWorkspace,
  replaceRolePermissions,
  replaceUserRoles,
  setUserActivation,
  updateRole,
  type AccessUser,
  type Permission,
  type Role,
} from "./accessApi";

interface AccessManagementProps {
  user: CurrentUser;
}

type LoadState =
  | { status: "loading" }
  | {
      status: "loaded";
      permissions: Permission[];
      roles: Role[];
      users: AccessUser[];
    }
  | { status: "error"; message: string };

export function AccessManagement({ user }: AccessManagementProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [draftPermissionKeys, setDraftPermissionKeys] = useState<string[]>([]);
  const [draftUserRoleIds, setDraftUserRoleIds] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRoleIds, setNewUserRoleIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canViewRoles = hasPermission(user, "roles.view");
  const canCreateRoles = hasPermission(user, "roles.create");
  const canUpdateRoles = hasPermission(user, "roles.update");
  const canAssignPermissions = hasPermission(user, "roles.assign_permissions");
  const canViewUsers = hasPermission(user, "users.view");
  const canCreateUsers = hasPermission(user, "users.create");
  const canAssignRoles = hasPermission(user, "users.assign_roles");
  const canActivateUsers = hasPermission(user, "users.activate");

  useEffect(() => {
    if (!canViewRoles || !canViewUsers) {
      setState({
        status: "error",
        message: "Vous n'avez pas acces a la gestion des roles.",
      });
      return;
    }

    let isMounted = true;

    getAccessWorkspace()
      .then((workspace) => {
        if (!isMounted) {
          return;
        }

        const firstEditableRole =
          workspace.roles.find((role) => !role.isSystem)?.id ??
          workspace.roles[0]?.id ??
          "";
        const firstUser = workspace.users[0]?.id ?? "";

        setState({ status: "loaded", ...workspace });
        setSelectedRoleId(firstEditableRole);
        setSelectedUserId(firstUser);
        setDraftPermissionKeys(
          workspace.roles.find((role) => role.id === firstEditableRole)
            ?.permissionKeys ?? [],
        );
        setDraftUserRoleIds(
          workspace.users
            .find((workspaceUser) => workspaceUser.id === firstUser)
            ?.roles.map((role) => role.id) ?? [],
        );
      })
      .catch((error: ApiError) => {
        if (isMounted) {
          setState({
            status: "error",
            message:
              error.error?.message ??
              "Impossible de charger les autorisations.",
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canViewRoles, canViewUsers]);

  const selectedRole =
    state.status === "loaded"
      ? state.roles.find((role) => role.id === selectedRoleId)
      : undefined;
  const selectedUser =
    state.status === "loaded"
      ? state.users.find((workspaceUser) => workspaceUser.id === selectedUserId)
      : undefined;
  const groupedPermissions = useMemo(() => {
    if (state.status !== "loaded") {
      return [];
    }

    return groupPermissions(state.permissions);
  }, [state]);

  function refreshWorkspace() {
    return getAccessWorkspace().then((workspace) => {
      setState({ status: "loaded", ...workspace });
      return workspace;
    });
  }

  function handleRoleSelection(roleId: string) {
    if (state.status !== "loaded") {
      return;
    }

    const role = state.roles.find((candidate) => candidate.id === roleId);
    setSelectedRoleId(roleId);
    setDraftPermissionKeys(role?.permissionKeys ?? []);
    setNotice("");
  }

  function handleUserSelection(userId: string) {
    if (state.status !== "loaded") {
      return;
    }

    const workspaceUser = state.users.find(
      (candidate) => candidate.id === userId,
    );
    setSelectedUserId(userId);
    setDraftUserRoleIds(workspaceUser?.roles.map((role) => role.id) ?? []);
    setNotice("");
  }

  async function handleCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice("");

    try {
      const role = await createRole({
        name: newRoleName,
        description: newRoleDescription,
        permissionKeys: [],
      });
      const workspace = await refreshWorkspace();
      setNewRoleName("");
      setNewRoleDescription("");
      setSelectedRoleId(role.id);
      setDraftPermissionKeys(
        workspace.roles.find((candidate) => candidate.id === role.id)
          ?.permissionKeys ?? [],
      );
      setNotice("Role cree.");
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveRolePermissions() {
    if (!selectedRole) {
      return;
    }

    setIsSubmitting(true);
    setNotice("");

    try {
      await replaceRolePermissions(selectedRole.id, draftPermissionKeys);
      await refreshWorkspace();
      setNotice("Autorisations enregistrees.");
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleRoleActivation(role: Role) {
    setIsSubmitting(true);
    setNotice("");

    try {
      await updateRole(role.id, { isActive: !role.isActive });
      await refreshWorkspace();
      setNotice(role.isActive ? "Role desactive." : "Role active.");
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveUserRoles() {
    if (!selectedUser) {
      return;
    }

    setIsSubmitting(true);
    setNotice("");

    try {
      await replaceUserRoles(selectedUser.id, draftUserRoleIds);
      await refreshWorkspace();
      setNotice("Roles utilisateur enregistres.");
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice("");

    try {
      const workspaceUser = await createUser({
        email: newUserEmail,
        displayName: newUserDisplayName,
        password: newUserPassword,
        roleIds: newUserRoleIds,
      });
      const workspace = await refreshWorkspace();
      setNewUserEmail("");
      setNewUserDisplayName("");
      setNewUserPassword("");
      setNewUserRoleIds([]);
      setSelectedUserId(workspaceUser.id);
      setDraftUserRoleIds(
        workspace.users
          .find((candidate) => candidate.id === workspaceUser.id)
          ?.roles.map((role) => role.id) ?? [],
      );
      setNotice("Utilisateur cree.");
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleUserActivation(workspaceUser: AccessUser) {
    setIsSubmitting(true);
    setNotice("");

    try {
      await setUserActivation(workspaceUser.id, !workspaceUser.isActive);
      await refreshWorkspace();
      setNotice(
        workspaceUser.isActive
          ? "Utilisateur desactive."
          : "Utilisateur active.",
      );
    } catch (error) {
      setNotice(readMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return <p aria-live="polite">Chargement des autorisations...</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }

  return (
    <section className="access-workspace" aria-labelledby="access-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Controle d'acces</p>
          <h2 id="access-title">Roles et autorisations</h2>
        </div>
        <p className="permission-count">
          {user.effectivePermissions.length} autorisations actives
        </p>
      </div>

      {notice ? <p role="status">{notice}</p> : null}

      <div className="access-grid">
        <section className="panel" aria-labelledby="roles-title">
          <div className="panel-heading">
            <h3 id="roles-title">Roles</h3>
            <span>{state.roles.length}</span>
          </div>

          {canCreateRoles ? (
            <form className="inline-form" onSubmit={handleCreateRole}>
              <label>
                Nom du role
                <input
                  onChange={(event) => setNewRoleName(event.target.value)}
                  required
                  value={newRoleName}
                />
              </label>
              <label>
                Description
                <input
                  onChange={(event) =>
                    setNewRoleDescription(event.target.value)
                  }
                  value={newRoleDescription}
                />
              </label>
              <button disabled={isSubmitting} type="submit">
                Creer
              </button>
            </form>
          ) : null}

          <div className="item-list" role="list">
            {state.roles.map((role) => (
              <button
                aria-pressed={role.id === selectedRoleId}
                className="list-button"
                key={role.id}
                onClick={() => handleRoleSelection(role.id)}
                type="button"
              >
                <span>{role.name}</span>
                <small>
                  {role.isSystem
                    ? "Systeme"
                    : role.isActive
                      ? "Actif"
                      : "Inactif"}
                </small>
              </button>
            ))}
          </div>

          {selectedRole && canUpdateRoles && !selectedRole.isSystem ? (
            <button
              className="secondary-button"
              disabled={isSubmitting}
              onClick={() => handleToggleRoleActivation(selectedRole)}
              type="button"
            >
              {selectedRole.isActive ? "Desactiver le role" : "Activer le role"}
            </button>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="matrix-title">
          <div className="panel-heading">
            <h3 id="matrix-title">Matrice</h3>
            <span>{selectedRole?.name ?? "Aucun role"}</span>
          </div>

          {selectedRole?.isSystem ? (
            <p className="summary">
              Le role Super Admin est protege et garde toutes les autorisations.
            </p>
          ) : null}

          <div className="permission-groups">
            {groupedPermissions.map((group) => (
              <fieldset key={group.module}>
                <legend>{group.module}</legend>
                {group.permissions.map((permission) => (
                  <label className="check-row" key={permission.key}>
                    <input
                      checked={draftPermissionKeys.includes(permission.key)}
                      disabled={
                        !canAssignPermissions ||
                        selectedRole?.isSystem ||
                        isSubmitting
                      }
                      onChange={() =>
                        setDraftPermissionKeys((current) =>
                          current.includes(permission.key)
                            ? current.filter((key) => key !== permission.key)
                            : [...current, permission.key],
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{permission.key}</strong>
                      <small>{permission.descriptionFr}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>

          {canAssignPermissions && !selectedRole?.isSystem ? (
            <button
              disabled={isSubmitting || !selectedRole}
              onClick={handleSaveRolePermissions}
              type="button"
            >
              Enregistrer la matrice
            </button>
          ) : null}
        </section>

        <section className="panel" aria-labelledby="users-title">
          <div className="panel-heading">
            <h3 id="users-title">Utilisateurs</h3>
            <span>{state.users.length}</span>
          </div>

          {canCreateUsers ? (
            <form className="inline-form" onSubmit={handleCreateUser}>
              <label>
                Nom utilisateur
                <input
                  onChange={(event) =>
                    setNewUserDisplayName(event.target.value)
                  }
                  required
                  value={newUserDisplayName}
                />
              </label>
              <label>
                E-mail
                <input
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  required
                  type="email"
                  value={newUserEmail}
                />
              </label>
              <label>
                Mot de passe temporaire
                <input
                  minLength={8}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  required
                  type="password"
                  value={newUserPassword}
                />
              </label>
              <fieldset>
                <legend>Roles initiaux</legend>
                {state.roles.map((role) => (
                  <label className="check-row" key={role.id}>
                    <input
                      checked={newUserRoleIds.includes(role.id)}
                      disabled={!role.isActive || isSubmitting}
                      onChange={() =>
                        setNewUserRoleIds((current) =>
                          current.includes(role.id)
                            ? current.filter((roleId) => roleId !== role.id)
                            : [...current, role.id],
                        )
                      }
                      type="checkbox"
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </fieldset>
              <button disabled={isSubmitting} type="submit">
                Creer l'utilisateur
              </button>
            </form>
          ) : null}

          <div className="item-list" role="list">
            {state.users.map((workspaceUser) => (
              <button
                aria-pressed={workspaceUser.id === selectedUserId}
                className="list-button"
                key={workspaceUser.id}
                onClick={() => handleUserSelection(workspaceUser.id)}
                type="button"
              >
                <span>{workspaceUser.displayName}</span>
                <small>{workspaceUser.isActive ? "Actif" : "Inactif"}</small>
              </button>
            ))}
          </div>

          {selectedUser ? (
            <div className="assignment-panel">
              <p className="summary">{selectedUser.email}</p>
              {state.roles.map((role) => (
                <label className="check-row" key={role.id}>
                  <input
                    checked={draftUserRoleIds.includes(role.id)}
                    disabled={!canAssignRoles || !role.isActive || isSubmitting}
                    onChange={() =>
                      setDraftUserRoleIds((current) =>
                        current.includes(role.id)
                          ? current.filter((roleId) => roleId !== role.id)
                          : [...current, role.id],
                      )
                    }
                    type="checkbox"
                  />
                  <span>{role.name}</span>
                </label>
              ))}
              <div className="button-row">
                {canAssignRoles ? (
                  <button
                    disabled={isSubmitting}
                    onClick={handleSaveUserRoles}
                    type="button"
                  >
                    Enregistrer les roles
                  </button>
                ) : null}
                {canActivateUsers ? (
                  <button
                    className="secondary-button"
                    disabled={isSubmitting}
                    onClick={() => handleToggleUserActivation(selectedUser)}
                    type="button"
                  >
                    {selectedUser.isActive
                      ? "Desactiver l'utilisateur"
                      : "Activer l'utilisateur"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function hasPermission(user: CurrentUser, permissionKey: string): boolean {
  return user.effectivePermissions.includes(permissionKey);
}

function groupPermissions(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();

  for (const permission of permissions) {
    groups.set(permission.module, [
      ...(groups.get(permission.module) ?? []),
      permission,
    ]);
  }

  return [...groups.entries()].map(([module, grouped]) => ({
    module,
    permissions: grouped,
  }));
}

function readMessage(error: unknown): string {
  const apiError = error as ApiError;
  return (
    apiError.error?.message ?? "Une erreur est survenue. Veuillez reessayer."
  );
}
