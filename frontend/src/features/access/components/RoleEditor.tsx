import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { fr } from "../../../i18n/fr.js";
import type { PermissionSet } from "../../../lib/auth/permissions.js";
import type { PermissionGroup, Role } from "../access.api.js";
import { useReplaceRolePermissions, useUpdateRole } from "../access.queries.js";
import { PermissionMatrix } from "./PermissionMatrix.js";
import styles from "./AccessForms.module.css";

export interface RoleEditorProps {
  role: Role;
  groups: PermissionGroup[];
  permissions: PermissionSet;
  onSaved?: (role: Role) => void;
}

function sameKeys(a: ReadonlySet<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((key) => a.has(key));
}

/// Name, description and the permission matrix of one role with a sticky
/// save bar and a guard on navigation while changes are unsaved (07 section
/// 4.10, AS-V2-22). The Super Admin role is read-only with an explanation.
export function RoleEditor({
  role,
  groups,
  permissions,
  onSaved,
}: RoleEditorProps) {
  const toast = useToast();
  const updateRole = useUpdateRole();
  const replacePermissions = useReplaceRolePermissions();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role.permissionKeys),
  );

  useEffect(() => {
    setName(role.name);
    setDescription(role.description ?? "");
    setSelected(new Set(role.permissionKeys));
  }, [role]);

  const readOnly = role.isSystem;
  const canEditRole = permissions.has("roles.update") && !readOnly;
  const canAssign = permissions.has("roles.assign_permissions") && !readOnly;
  const headerDirty =
    canEditRole &&
    (name !== role.name || description !== (role.description ?? ""));
  const matrixDirty = canAssign && !sameKeys(selected, role.permissionKeys);
  const dirty = headerDirty || matrixDirty;
  const saving = updateRole.isPending || replacePermissions.isPending;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const save = async () => {
    try {
      let saved = role;
      if (headerDirty)
        saved = await updateRole.mutateAsync({
          roleId: role.id,
          body: {
            name: name.trim(),
            description: description.trim() || undefined,
          },
        });
      if (matrixDirty)
        saved = await replacePermissions.mutateAsync({
          roleId: role.id,
          permissionKeys: [...selected].sort(),
        });
      toast.success(
        "Rôle enregistré",
        `${saved.name} · ${saved.permissionCount} autorisation${saved.permissionCount > 1 ? "s" : ""}.`,
      );
      onSaved?.(saved);
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <div className={styles.stack}>
      {readOnly ? (
        <p className={styles.notice}>
          Le rôle Super Admin est protégé : il détient toutes les autorisations
          et ne peut pas être modifié.
        </p>
      ) : null}
      <FormField label="Nom" required>
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEditRole}
        />
      </FormField>
      <FormField label="Description">
        <TextArea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          disabled={!canEditRole}
        />
      </FormField>
      <PermissionMatrix
        groups={groups}
        selected={selected}
        onChange={setSelected}
        readOnly={!canAssign}
      />
      {!readOnly ? (
        <div className={styles.footer}>
          <span className={styles.muted} aria-live="polite">
            {dirty
              ? "Modifications non enregistrées."
              : `${selected.size} autorisation${selected.size > 1 ? "s" : ""} sélectionnée${selected.size > 1 ? "s" : ""}.`}
          </span>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={!dirty}
          >
            {fr.save}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title={fr.unsavedChanges}
        tone="danger"
        confirmLabel="Quitter sans enregistrer"
        impact={<p>Les modifications du rôle {role.name} seront perdues.</p>}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}
