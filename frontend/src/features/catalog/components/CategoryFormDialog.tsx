import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { fr } from "../../../i18n/fr.js";
import type { Category } from "../catalog.api.js";
import { useCreateCategory, useUpdateCategory } from "../catalog.queries.js";
import {
  categorySchema,
  type CategoryFormInput,
  type CategoryFormOutput,
} from "../catalog.schemas.js";

export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category = null,
}: CategoryFormDialogProps) {
  const toast = useToast();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const form = useForm<CategoryFormInput, unknown, CategoryFormOutput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: category?.name ?? "",
        description: category?.description ?? "",
      });
    }
  }, [open, category, form]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={category ? `Modifier ${category.name}` : "Nouvelle catégorie"}
      form={form}
      onSubmit={async (values) => {
        const saved = category
          ? await update.mutateAsync({ categoryId: category.id, ...values })
          : await create.mutateAsync(values);
        toast.success(
          category ? "Catégorie modifiée" : "Catégorie créée",
          saved.name,
        );
        onOpenChange(false);
      }}
    >
      <FormField
        label={fr.name}
        error={form.formState.errors.name?.message}
        required
      >
        <TextInput {...form.register("name")} />
      </FormField>
      <FormField
        label={fr.description}
        error={form.formState.errors.description?.message}
      >
        <TextArea {...form.register("description")} rows={2} />
      </FormField>
    </FormDialog>
  );
}
