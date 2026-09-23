import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { AccessUser } from "../access.api.js";
import { useCreateUser, useRoles, useUpdateUser } from "../access.queries.js";
import {
  generateTemporaryPassword,
  userProfileSchema,
  userSchema,
  type UserFormInput,
  type UserFormOutput,
  type UserProfileFormInput,
  type UserProfileFormOutput,
} from "../access.schemas.js";
import styles from "./AccessForms.module.css";

export interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// An existing user edits name and e-mail only; null creates.
  user?: AccessUser | null;
}

/// "Nouvel utilisateur" (07 section 4.10, OD-V2-011): display name, e-mail,
/// a temporary password to generate and copy once, and the roles.
export function UserFormDialog({
  open,
  onOpenChange,
  user = null,
}: UserFormDialogProps) {
  return user ? (
    <EditUserDialog open={open} onOpenChange={onOpenChange} user={user} />
  ) : (
    <CreateUserDialog open={open} onOpenChange={onOpenChange} />
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const roles = useRoles();
  const create = useCreateUser();
  const form = useForm<UserFormInput, unknown, UserFormOutput>({
    resolver: zodResolver(userSchema),
    defaultValues: { displayName: "", email: "", password: "", roleIds: [] },
  });
  const errors = form.formState.errors;
  const password = form.watch("password") ?? "";

  useEffect(() => {
    if (open)
      form.reset({
        displayName: "",
        email: "",
        password: generateTemporaryPassword(),
        roleIds: [],
      });
  }, [open, form]);

  const submit = async (values: UserFormOutput) => {
    const created = await create.mutateAsync(values);
    toast.success(
      "Utilisateur créé",
      `${created.displayName} · transmettez-lui le mot de passe temporaire.`,
    );
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvel utilisateur"
      description="Le mot de passe temporaire est affiché une seule fois ; l'utilisateur le changera depuis Paramètres."
      form={form}
      onSubmit={submit}
      submitLabel="Créer l'utilisateur"
    >
      <FormField
        label="Nom affiché"
        error={errors.displayName?.message}
        required
      >
        <TextInput {...form.register("displayName")} autoComplete="off" />
      </FormField>
      <FormField label="E-mail" error={errors.email?.message} required>
        <TextInput
          {...form.register("email")}
          type="email"
          inputMode="email"
          autoComplete="off"
        />
      </FormField>
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
      <FormField label="Rôles" labelIsElement={false}>
        <Controller
          control={form.control}
          name="roleIds"
          render={({ field }) => (
            <div className={styles.roleList} role="group" aria-label="Rôles">
              {(roles.data ?? []).map((role) => (
                <Checkbox
                  key={role.id}
                  label={role.name}
                  description={role.description ?? undefined}
                  checked={(field.value ?? []).includes(role.id)}
                  onCheckedChange={(checked) =>
                    field.onChange(
                      checked === true
                        ? [...(field.value ?? []), role.id]
                        : (field.value ?? []).filter((id) => id !== role.id),
                    )
                  }
                />
              ))}
            </div>
          )}
        />
      </FormField>
    </FormDialog>
  );
}

function EditUserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AccessUser;
}) {
  const toast = useToast();
  const update = useUpdateUser();
  const form = useForm<UserProfileFormInput, unknown, UserProfileFormOutput>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: { displayName: user.displayName, email: user.email },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset({ displayName: user.displayName, email: user.email });
  }, [open, user, form]);

  const submit = async (values: UserProfileFormOutput) => {
    const saved = await update.mutateAsync({
      userId: user.id,
      body: { version: user.version ?? 1, ...values },
    });
    toast.success("Utilisateur modifié", saved.displayName);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Modifier ${user.displayName}`}
      form={form}
      onSubmit={submit}
    >
      <FormField
        label="Nom affiché"
        error={errors.displayName?.message}
        required
      >
        <TextInput {...form.register("displayName")} />
      </FormField>
      <FormField label="E-mail" error={errors.email?.message} required>
        <TextInput {...form.register("email")} type="email" inputMode="email" />
      </FormField>
    </FormDialog>
  );
}
