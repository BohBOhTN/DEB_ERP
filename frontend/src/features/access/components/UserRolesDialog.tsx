import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button/Button.js";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox.js";
import { Dialog } from "../../../components/ui/Dialog/Dialog.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { fr } from "../../../i18n/fr.js";
import type { AccessUser } from "../access.api.js";
import { useReplaceUserRoles, useRoles } from "../access.queries.js";
import styles from "./AccessForms.module.css";

export interface UserRolesDialogProps {
  user: AccessUser | null;
  onClose: () => void;
}

/// The roles of one user as a checkbox list (AS-002: a change applies at
/// the next request, no deployment).
export function UserRolesDialog({ user, onClose }: UserRolesDialogProps) {
  const toast = useToast();
  const roles = useRoles();
  const replace = useReplaceUserRoles();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(user?.roles.map((role) => role.id) ?? []);
  }, [user]);

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title={user ? `Rôles de ${user.displayName}` : "Rôles"}
      description="Les autorisations effectives sont l'union des rôles cochés."
      preventClose={replace.isPending}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={replace.isPending}
          >
            {fr.cancel}
          </Button>
          <Button
            loading={replace.isPending}
            onClick={() => {
              if (!user) return;
              replace.mutate(
                { userId: user.id, roleIds: selected },
                {
                  onSuccess: (saved) => {
                    toast.success("Rôles enregistrés", saved.displayName);
                    onClose();
                  },
                  onError: (error) => toast.fromError(error),
                },
              );
            }}
          >
            {fr.save}
          </Button>
        </>
      }
    >
      <div className={styles.roleList} role="group" aria-label="Rôles">
        {(roles.data ?? []).map((role) => (
          <Checkbox
            key={role.id}
            label={role.name}
            description={
              role.description ??
              (role.isSystem ? "Rôle système protégé" : undefined)
            }
            checked={selected.includes(role.id)}
            onCheckedChange={(checked) =>
              setSelected((current) =>
                checked === true
                  ? [...current, role.id]
                  : current.filter((id) => id !== role.id),
              )
            }
          />
        ))}
      </div>
    </Dialog>
  );
}
