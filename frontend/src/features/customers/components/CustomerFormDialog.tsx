import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { Customer } from "../customers.api.js";
import { useCreateCustomer, useUpdateCustomer } from "../customers.queries.js";
import {
  customerSchema,
  type CustomerFormInput,
  type CustomerFormOutput,
} from "../customers.schemas.js";

export interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved?: (customer: Customer) => void;
}

function defaultsFor(customer: Customer | null | undefined): CustomerFormInput {
  return {
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    taxIdentifier: customer?.taxIdentifier ?? "",
    notes: customer?.notes ?? "",
  };
}

/// Customer creation and edition (07 section 4.4, CUS-002, CUS-003): the
/// name is the only required field; edition carries the version.
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer = null,
  onSaved,
}: CustomerFormDialogProps) {
  const toast = useToast();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const form = useForm<CustomerFormInput, unknown, CustomerFormOutput>({
    resolver: zodResolver(customerSchema),
    defaultValues: defaultsFor(customer),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(defaultsFor(customer));
  }, [open, customer, form]);

  const submit = async (values: CustomerFormOutput) => {
    const saved = customer
      ? await update.mutateAsync({
          customerId: customer.id,
          version: customer.version,
          ...values,
        })
      : await create.mutateAsync(values);
    toast.success(customer ? "Client modifié" : "Client créé", saved.name);
    onSaved?.(saved);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Modifier ${customer.name}` : "Nouveau client"}
      form={form}
      onSubmit={submit}
    >
      <FormField label="Nom" error={errors.name?.message} required>
        <TextInput {...form.register("name")} autoComplete="name" />
      </FormField>
      <FormField label="Téléphone" error={errors.phone?.message}>
        <TextInput
          {...form.register("phone")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
        />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={3} />
      </FormField>
    </FormDialog>
  );
}
