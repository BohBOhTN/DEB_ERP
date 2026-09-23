import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { Distributor } from "../distribution.api.js";
import {
  useCreateDistributor,
  useUpdateDistributor,
} from "../distribution.queries.js";
import {
  distributorSchema,
  type DistributorFormInput,
  type DistributorFormOutput,
} from "../distribution.schemas.js";
import styles from "./DistributionForms.module.css";

export interface DistributorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distributor?: Distributor | null;
  onSaved?: (distributor: Distributor) => void;
}

function defaultsFor(
  distributor: Distributor | null | undefined,
): DistributorFormInput {
  return {
    name: distributor?.name ?? "",
    phone: distributor?.phone ?? "",
    address: distributor?.address ?? "",
    taxIdentifier: distributor?.taxIdentifier ?? "",
    notes: distributor?.notes ?? "",
  };
}

/// Distributor creation and edition (DST-001, DST-002): the name is the only
/// required field; edition carries the version.
export function DistributorFormDialog({
  open,
  onOpenChange,
  distributor = null,
  onSaved,
}: DistributorFormDialogProps) {
  const toast = useToast();
  const create = useCreateDistributor();
  const update = useUpdateDistributor();
  const form = useForm<DistributorFormInput, unknown, DistributorFormOutput>({
    resolver: zodResolver(distributorSchema),
    defaultValues: defaultsFor(distributor),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(defaultsFor(distributor));
  }, [open, distributor, form]);

  const submit = async (values: DistributorFormOutput) => {
    const saved = distributor
      ? await update.mutateAsync({
          distributorId: distributor.id,
          version: distributor.version,
          ...values,
        })
      : await create.mutateAsync(values);
    toast.success(
      distributor ? "Distributeur modifié" : "Distributeur créé",
      saved.name,
    );
    onSaved?.(saved);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        distributor ? `Modifier ${distributor.name}` : "Nouveau distributeur"
      }
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
