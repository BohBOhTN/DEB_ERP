import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { ExpenseCategory } from "../expenses.api.js";
import {
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
} from "../expenses.queries.js";
import {
  expenseCategorySchema,
  type ExpenseCategoryFormInput,
  type ExpenseCategoryFormOutput,
} from "../expenses.schemas.js";

export interface ExpenseCategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ExpenseCategory | null;
}

/// Category creation and rename (EXP-001, EXP-002); deactivation lives in
/// the row actions so a category used in history is never deleted.
export function ExpenseCategoryFormDialog({
  open,
  onOpenChange,
  category = null,
}: ExpenseCategoryFormDialogProps) {
  const toast = useToast();
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  const form = useForm<
    ExpenseCategoryFormInput,
    unknown,
    ExpenseCategoryFormOutput
  >({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open)
      form.reset({
        name: category?.name ?? "",
        description: category?.description ?? "",
      });
  }, [open, category, form]);

  const submit = async (values: ExpenseCategoryFormOutput) => {
    const saved = category
      ? await update.mutateAsync({
          categoryId: category.id,
          version: category.version,
          ...values,
        })
      : await create.mutateAsync(values);
    toast.success(
      category ? "Catégorie modifiée" : "Catégorie créée",
      saved.name,
    );
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        category ? `Modifier ${category.name}` : "Nouvelle catégorie de dépense"
      }
      form={form}
      onSubmit={submit}
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
