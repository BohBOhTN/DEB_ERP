import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { categoryLabel, type ExpenseCategory } from "../expenses.api.js";
import {
  useCreateExpenseCategory,
  useExpenseCategories,
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
/// the row actions so a category used in history is never deleted. Issue
/// 018: an optional parent, chosen among the active categories that are
/// neither this one nor one of its descendants.
export function ExpenseCategoryFormDialog({
  open,
  onOpenChange,
  category = null,
}: ExpenseCategoryFormDialogProps) {
  const toast = useToast();
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  const categories = useExpenseCategories({ isActive: true });
  const form = useForm<
    ExpenseCategoryFormInput,
    unknown,
    ExpenseCategoryFormOutput
  >({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      parentId: category?.parentId ?? "",
    },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open)
      form.reset({
        name: category?.name ?? "",
        description: category?.description ?? "",
        parentId: category?.parentId ?? "",
      });
  }, [open, category, form]);

  // A category cannot go under itself or under one of its own
  // sub-categories: those are left out of the parent picker.
  const excluded = descendantsOf(categories.data ?? [], category?.id);
  const parentOptions = (categories.data ?? [])
    .filter((row) => !excluded.has(row.id))
    .map((row) => ({ value: row.id, label: categoryLabel(row) }));

  const submit = async (values: ExpenseCategoryFormOutput) => {
    const input = {
      name: values.name,
      description: values.description,
      parentId: values.parentId || null,
    };
    const saved = category
      ? await update.mutateAsync({
          categoryId: category.id,
          version: category.version,
          ...input,
        })
      : await create.mutateAsync(input);
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
      <FormField
        label="Catégorie parente"
        error={errors.parentId?.message}
        hint="Pour une sous-catégorie, par exemple Emballage sous Fournitures."
      >
        <Controller
          control={form.control}
          name="parentId"
          render={({ field }) => (
            <Select
              aria-label="Catégorie parente"
              placeholder="Aucune (niveau principal)"
              clearable
              value={field.value || null}
              onValueChange={(value) => field.onChange(value ?? "")}
              options={parentOptions}
            />
          )}
        />
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        <TextArea {...form.register("description")} rows={2} />
      </FormField>
    </FormDialog>
  );
}

function descendantsOf(
  categories: ExpenseCategory[],
  categoryId: string | undefined,
): Set<string> {
  const excluded = new Set<string>();
  if (!categoryId) return excluded;
  excluded.add(categoryId);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of categories) {
      if (row.parentId && excluded.has(row.parentId) && !excluded.has(row.id)) {
        excluded.add(row.id);
        grew = true;
      }
    }
  }
  return excluded;
}
