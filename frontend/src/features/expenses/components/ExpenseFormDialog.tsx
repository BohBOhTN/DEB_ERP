import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { Switch } from "../../../components/ui/Switch/Switch.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatMoney, toBusinessDate } from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Expense } from "../expenses.api.js";
import {
  useCreateExpense,
  useExpenseCategories,
  useUpdateExpense,
} from "../expenses.queries.js";
import {
  expenseSchema,
  type ExpenseFormInput,
  type ExpenseFormOutput,
} from "../expenses.schemas.js";
import styles from "./ExpenseForms.module.css";

export interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// A draft to edit; null creates.
  expense?: Expense | null;
  onSaved?: (expense: Expense) => void;
}

function defaultsFor(expense: Expense | null | undefined): ExpenseFormInput {
  return {
    categoryId: expense?.categoryId ?? "",
    expenseDate: expense
      ? toBusinessDate(expense.expenseDate)
      : toBusinessDate(new Date()),
    amountTnd: expense?.amountTnd ?? "",
    description: expense?.description ?? "",
    externalReference: expense?.externalReference ?? "",
    notes: expense?.notes ?? "",
    post: false,
  };
}

/// "Nouvelle dépense" and the draft editor (07 section 4.8, EXP-004 to
/// EXP-006): category, date, label, amount, notes, and the switch that
/// posts at once. Edition carries the version.
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense = null,
  onSaved,
}: ExpenseFormDialogProps) {
  const toast = useToast();
  const permissions = useSessionPermissions();
  const categories = useExpenseCategories({ isActive: true });
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const form = useForm<ExpenseFormInput, unknown, ExpenseFormOutput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: defaultsFor(expense),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(defaultsFor(expense));
  }, [open, expense, form]);

  const submit = async (values: ExpenseFormOutput) => {
    const saved = expense
      ? await update.mutateAsync({
          expenseId: expense.id,
          version: expense.version,
          categoryId: values.categoryId,
          expenseDate: values.expenseDate,
          amountTnd: values.amountTnd,
          description: values.description,
          externalReference: values.externalReference || undefined,
          notes: values.notes || undefined,
        })
      : await create.mutateAsync({
          categoryId: values.categoryId,
          expenseDate: values.expenseDate,
          amountTnd: values.amountTnd,
          description: values.description,
          externalReference: values.externalReference || undefined,
          notes: values.notes || undefined,
          post: values.post,
        });
    toast.success(
      expense
        ? "Dépense modifiée"
        : saved.status === "POSTED"
          ? "Dépense validée"
          : "Brouillon enregistré",
      `${saved.reference} · ${formatMoney(saved.amountTnd)}`,
    );
    onSaved?.(saved);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={expense ? `Modifier ${expense.reference}` : "Nouvelle dépense"}
      form={form}
      onSubmit={submit}
      submitLabel={expense ? "Enregistrer" : "Enregistrer la dépense"}
    >
      <div className={styles.twoColumns}>
        <FormField label="Date" error={errors.expenseDate?.message} required>
          <Controller
            control={form.control}
            name="expenseDate"
            render={({ field }) => (
              <DateInput value={field.value ?? ""} onChange={field.onChange} />
            )}
          />
        </FormField>
        <FormField
          label="Catégorie"
          error={errors.categoryId?.message}
          required
        >
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                aria-label="Catégorie"
                placeholder="Choisir une catégorie"
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? "")}
                options={(categories.data ?? []).map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                invalid={Boolean(errors.categoryId)}
              />
            )}
          />
        </FormField>
      </div>
      {permissions.has("expense_categories.manage") ? (
        <p className={`${styles.muted} ${styles.categoryHint}`}>
          <Link to="/depenses/categories">Gérer les catégories</Link>
        </p>
      ) : null}
      <FormField label="Libellé" error={errors.description?.message} required>
        <TextInput
          {...form.register("description")}
          placeholder="Facture STEG, loyer de septembre…"
        />
      </FormField>
      <div className={styles.twoColumns}>
        <FormField label="Montant" error={errors.amountTnd?.message} required>
          <Controller
            control={form.control}
            name="amountTnd"
            render={({ field }) => (
              <MoneyInput
                value={field.value ?? ""}
                onChange={field.onChange}
                invalid={Boolean(errors.amountTnd)}
              />
            )}
          />
        </FormField>
        <FormField
          label="Référence externe"
          error={errors.externalReference?.message}
          hint="Numéro de facture ou de reçu."
        >
          <TextInput {...form.register("externalReference")} />
        </FormField>
      </div>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
      {!expense ? (
        <Controller
          control={form.control}
          name="post"
          render={({ field }) => (
            <Switch
              label="Valider immédiatement"
              description="La dépense compte dans les totaux dès l'enregistrement ; sinon elle reste en brouillon."
              checked={field.value ?? false}
              onCheckedChange={field.onChange}
            />
          )}
        />
      ) : null}
    </FormDialog>
  );
}
