import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { AccessUser } from "../access.api.js";
import { useResetUserPassword } from "../access.queries.js";
import {
  generateTemporaryPassword,
  resetPasswordSchema,
  type ResetPasswordFormInput,
  type ResetPasswordFormOutput,
} from "../access.schemas.js";
import styles from "./AccessForms.module.css";

export interface ResetPasswordDialogProps {
  user: AccessUser | null;
  onClose: () => void;
}

/// BE-38, OD-V2-011: the Super Admin sets a temporary password that the
/// user changes afterwards; no e-mail flow.
export function ResetPasswordDialog({
  user,
  onClose,
}: ResetPasswordDialogProps) {
  const toast = useToast();
  const reset = useResetUserPassword();
  const form = useForm<
    ResetPasswordFormInput,
    unknown,
    ResetPasswordFormOutput
  >({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });
  const errors = form.formState.errors;
  const password = form.watch("password") ?? "";

  useEffect(() => {
    if (user) form.reset({ password: generateTemporaryPassword() });
  }, [user, form]);

  return (
    <FormDialog
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title={
        user
          ? `Réinitialiser le mot de passe de ${user.displayName}`
          : "Réinitialiser le mot de passe"
      }
      description="Le mot de passe temporaire est affiché une seule fois."
      form={form}
      onSubmit={async (values) => {
        if (!user) return;
        await reset.mutateAsync({ userId: user.id, password: values.password });
        toast.success("Mot de passe réinitialisé", user.displayName);
        onClose();
      }}
      submitLabel="Réinitialiser"
    >
      <FormField
        label="Mot de passe temporaire"
        error={errors.password?.message}
        required
        hint="Au moins 8 caractères."
      >
        <div className={styles.passwordRow}>
          <TextInput
            {...form.register("password")}
            autoComplete="new-password"
          />
          <IconButton
            label="Générer un mot de passe"
            icon={<RefreshCw />}
            onClick={() =>
              form.setValue("password", generateTemporaryPassword(), {
                shouldValidate: true,
              })
            }
          />
          <IconButton
            label="Copier le mot de passe"
            icon={<Copy />}
            onClick={() => {
              void navigator.clipboard?.writeText(password);
              toast.info("Mot de passe copié");
            }}
          />
        </div>
      </FormField>
    </FormDialog>
  );
}
