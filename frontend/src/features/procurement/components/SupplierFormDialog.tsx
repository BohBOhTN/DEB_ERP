import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { Supplier } from "../procurement.api.js";
import {
  useCreateSupplier,
  useUpdateSupplier,
} from "../procurement.queries.js";
import {
  supplierSchema,
  type SupplierFormInput,
  type SupplierFormOutput,
} from "../procurement.schemas.js";
import styles from "./ProcurementForms.module.css";

export interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved?: (supplier: Supplier) => void;
}

function defaultsFor(supplier: Supplier | null | undefined): SupplierFormInput {
  return {
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    taxIdentifier: supplier?.taxIdentifier ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  };
}

/// Supplier creation and edition (07 section 4.3): nom, téléphone,
/// identifiant fiscal, adresse, notes. Edition sends the version so a
/// concurrent change is refused, not overwritten.
export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier = null,
  onSaved,
}: SupplierFormDialogProps) {
  const toast = useToast();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const form = useForm<SupplierFormInput, unknown, SupplierFormOutput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: defaultsFor(supplier),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaultsFor(supplier));
    }
  }, [open, supplier, form]);

  const submit = async (values: SupplierFormOutput) => {
    const saved = supplier
      ? await update.mutateAsync({
          supplierId: supplier.id,
          version: supplier.version,
          ...values,
        })
      : await create.mutateAsync(values);
    toast.success(
      supplier ? "Fournisseur modifié" : "Fournisseur créé",
      saved.name,
    );
    onSaved?.(saved);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? `Modifier ${supplier.name}` : "Nouveau fournisseur"}
      form={form}
      onSubmit={submit}
    >
      <FormField label="Nom" error={errors.name?.message} required>
        <TextInput {...form.register("name")} autoComplete="organization" />
      </FormField>
      <div className={styles.twoColumns}>
        <FormField label="Téléphone" error={errors.phone?.message}>
          <TextInput
            {...form.register("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
          />
        </FormField>
        <FormField
          label="Identifiant fiscal"
          error={errors.taxIdentifier?.message}
        >
          <TextInput {...form.register("taxIdentifier")} />
        </FormField>
      </div>
      <FormField label="Adresse" error={errors.address?.message}>
        <TextInput
          {...form.register("address")}
          autoComplete="street-address"
        />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={3} />
      </FormField>
    </FormDialog>
  );
}
