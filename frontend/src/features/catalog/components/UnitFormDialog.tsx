import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { fr } from "../../../i18n/fr.js";
import type { Unit } from "../catalog.api.js";
import { useCreateUnit, useUpdateUnit } from "../catalog.queries.js";
import {
  unitSchema,
  type UnitFormInput,
  type UnitFormOutput,
} from "../catalog.schemas.js";
import styles from "./FormDialogs.module.css";

export interface UnitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit?: Unit | null;
}

const precisionOptions = Array.from({ length: 7 }, (_, precision) => ({
  value: String(precision),
  label:
    precision === 0
      ? "0 (entier)"
      : `${precision} décimale${precision > 1 ? "s" : ""}`,
}));

export function UnitFormDialog({
  open,
  onOpenChange,
  unit = null,
}: UnitFormDialogProps) {
  const toast = useToast();
  const create = useCreateUnit();
  const update = useUpdateUnit();
  const defaults = (): UnitFormInput => ({
    code: unit?.code ?? "",
    name: unit?.name ?? "",
    symbol: unit?.symbol ?? "",
    precision: unit?.precision ?? 3,
  });
  const form = useForm<UnitFormInput, unknown, UnitFormOutput>({
    resolver: zodResolver(unitSchema),
    defaultValues: defaults(),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset({
        code: unit?.code ?? "",
        name: unit?.name ?? "",
        symbol: unit?.symbol ?? "",
        precision: unit?.precision ?? 3,
      });
    }
  }, [open, unit, form]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={unit ? `Modifier ${unit.name}` : "Nouvelle unité"}
      form={form}
      onSubmit={async (values) => {
        const saved = unit
          ? await update.mutateAsync({
              unitId: unit.id,
              name: values.name,
              symbol: values.symbol,
              precision: values.precision,
            })
          : await create.mutateAsync(values);
        toast.success(unit ? "Unité modifiée" : "Unité créée", saved.name);
        onOpenChange(false);
      }}
    >
      <div className={styles.twoColumns}>
        <FormField
          label="Code"
          error={errors.code?.message}
          required
          hint={unit ? "Le code ne change pas après création." : "Ex. KG, PC"}
        >
          <TextInput {...form.register("code")} disabled={Boolean(unit)} />
        </FormField>
        <FormField label="Symbole" error={errors.symbol?.message} required>
          <TextInput {...form.register("symbol")} />
        </FormField>
      </div>
      <FormField label={fr.name} error={errors.name?.message} required>
        <TextInput {...form.register("name")} />
      </FormField>
      <FormField
        label="Précision"
        error={errors.precision?.message}
        required
        hint="Nombre de décimales des quantités."
      >
        <Controller
          control={form.control}
          name="precision"
          render={({ field }) => (
            <Select
              options={precisionOptions}
              value={String(field.value ?? 3)}
              onValueChange={(value) => field.onChange(Number(value ?? 3))}
            />
          )}
        />
      </FormField>
    </FormDialog>
  );
}
