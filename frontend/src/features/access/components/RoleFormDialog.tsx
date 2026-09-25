import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { Role } from "../access.api.js";
import { useCreateRole } from "../access.queries.js";
import {
  roleSchema,
  type RoleFormInput,
  type RoleFormOutput,
} from "../access.schemas.js";

export interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (role: Role) => void;
}

/// A new role starts empty; its permissions are set in the editor.
export function RoleFormDialog({
  open,
  onOpenChange,
  onCreated,
}: RoleFormDialogProps) {
  const toast = useToast();
  const create = useCreateRole();
  const form = useForm<RoleFormInput, unknown, RoleFormOutput>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", description: "" },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset({ name: "", description: "" });
  }, [open, form]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau rôle"
      form={form}
      onSubmit={async (values) => {
        const role = await create.mutateAsync({
          name: values.name,
          description: values.description || undefined,
          permissionKeys: [],
        });
        toast.success("Rôle créé", role.name);
        onCreated?.(role);
        onOpenChange(false);
      }}
      submitLabel="Créer le rôle"
    >
      <FormField label="Nom" error={errors.name?.message} required>
        <TextInput {...form.register("name")} />
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        <TextArea {...form.register("description")} rows={2} />
      </FormField>
    </FormDialog>
  );
}
