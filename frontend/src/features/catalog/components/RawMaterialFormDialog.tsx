import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { fr } from "../../../i18n/fr.js";
import type { RawMaterial } from "../catalog.api.js";
import {
  catalogKeys,
  useCreateRawMaterial,
  useUnits,
  useUpdateRawMaterial,
} from "../catalog.queries.js";
import {
  rawMaterialSchema,
  type RawMaterialFormInput,
  type RawMaterialFormOutput,
} from "../catalog.schemas.js";
import { ConversionsEditor } from "./ConversionsEditor.js";
import styles from "./FormDialogs.module.css";

export interface RawMaterialFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawMaterial?: RawMaterial | null;
  onSaved?: (rawMaterial: RawMaterial) => void;
}

function defaultsFor(
  rawMaterial: RawMaterial | null | undefined,
): RawMaterialFormInput {
  return {
    name: rawMaterial?.name ?? "",
    baseUnitId: rawMaterial?.baseUnitId ?? "",
    code: rawMaterial?.code ?? "",
    category: rawMaterial?.category ?? "",
    notes: rawMaterial?.notes ?? "",
    conversions: (rawMaterial?.conversions ?? [])
      .filter((c) => c.isActive)
      .map((c) => ({ unitId: c.unitId, factorToBase: c.factorToBase })),
  };
}

export function RawMaterialFormDialog({
  open,
  onOpenChange,
  rawMaterial = null,
  onSaved,
}: RawMaterialFormDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const units = useUnits();
  const create = useCreateRawMaterial();
  const update = useUpdateRawMaterial(rawMaterial?.id ?? "");
  const form = useForm<RawMaterialFormInput, unknown, RawMaterialFormOutput>({
    resolver: zodResolver(rawMaterialSchema),
    defaultValues: defaultsFor(rawMaterial),
  });
  const errors = form.formState.errors;
  const baseUnitId = form.watch("baseUnitId");
  const baseUnit = (units.data?.items ?? []).find(
    (unit) => unit.id === baseUnitId,
  );
  const conversionErrors: Record<string, string | undefined> = {};
  (
    errors.conversions as unknown as
      Array<Record<string, { message?: string }>> | undefined
  )?.forEach((row, index) => {
    if (row?.unitId?.message)
      conversionErrors[`conversions.${index}.unitId`] = row.unitId.message;
    if (row?.factorToBase?.message)
      conversionErrors[`conversions.${index}.factorToBase`] =
        row.factorToBase.message;
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultsFor(rawMaterial));
    }
  }, [open, rawMaterial, form]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={
        rawMaterial
          ? `Modifier ${rawMaterial.name}`
          : "Nouvelle matière première"
      }
      form={form}
      onReload={() => {
        // The newer version is fetched again so the list shows it (AS-V2-15).
        void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
        onOpenChange(false);
      }}
      onSubmit={async (values) => {
        const saved = rawMaterial
          ? await update.mutateAsync({
              ...values,
              version: rawMaterial.version,
            })
          : await create.mutateAsync(values);
        toast.success(
          rawMaterial ? "Matière première modifiée" : "Matière première créée",
          saved.name,
        );
        onSaved?.(saved);
        onOpenChange(false);
      }}
    >
      <FormField label={fr.name} error={errors.name?.message} required>
        <TextInput {...form.register("name")} />
      </FormField>
      <div className={styles.twoColumns}>
        <FormField
          label="Unité de base"
          error={errors.baseUnitId?.message}
          required
        >
          <Controller
            control={form.control}
            name="baseUnitId"
            render={({ field }) => (
              <Select
                options={(units.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.symbol})`,
                }))}
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? "")}
                invalid={Boolean(errors.baseUnitId)}
              />
            )}
          />
        </FormField>
        <FormField
          label="Famille"
          error={errors.category?.message}
          hint="Facultatif, texte libre (Farines, Sucres…)"
        >
          <TextInput {...form.register("category")} />
        </FormField>
      </div>
      <FormField label="Code" error={errors.code?.message} hint="Facultatif">
        <TextInput {...form.register("code")} />
      </FormField>
      <FormField
        label="Conversions d'unités"
        hint="Unités d'achat exprimées dans l'unité de base."
        labelIsElement={false}
      >
        <Controller
          control={form.control}
          name="conversions"
          render={({ field }) => (
            <ConversionsEditor
              rows={field.value ?? []}
              onChange={field.onChange}
              units={units.data?.items ?? []}
              baseUnit={baseUnit}
              errors={conversionErrors}
            />
          )}
        />
      </FormField>
      <FormField label={fr.notes} error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
    </FormDialog>
  );
}
